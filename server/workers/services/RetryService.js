/**
 * RetryService.js
 *
 * Implements exponential backoff retry scheduling for failed log ingestion.
 *
 * Design:
 * ─────────────────────────────────────────────────────────────────────────────
 * Instead of re-adding failed logs straight back to the main stream (where
 * they would compete with fresh logs), we schedule them into a Redis Sorted Set:
 *
 *   Key:   `logs:retry`  (configurable via RETRY_STREAM env var)
 *   Score: Unix timestamp (ms) at which the log becomes eligible for retry
 *   Member: JSON-serialised retry payload
 *
 * A non-blocking RetryPump polls every PUMP_INTERVAL_MS (500 ms) and promotes
 * any "ready" entries (score <= Date.now()) back into the main stream.
 * This keeps the main consumer loop clean and avoids sleeping the worker thread.
 *
 * Exponential delay formula:
 *   delay = INITIAL_RETRY_DELAY_MS * (RETRY_BACKOFF_FACTOR ^ attemptIndex)
 *
 *   attempt 1 → 1000 * 2^0 = 1 s
 *   attempt 2 → 1000 * 2^1 = 2 s
 *   attempt 3 → 1000 * 2^2 = 4 s
 *   attempt 4 → 1000 * 2^3 = 8 s
 *   attempt 5 → MAX_RETRY_ATTEMPTS exceeded → DLQ
 *
 * Environment variables:
 *   MAX_RETRY_ATTEMPTS      (default 5)
 *   INITIAL_RETRY_DELAY_MS  (default 1000)
 *   RETRY_BACKOFF_FACTOR    (default 2)
 *   RETRY_STREAM            (default "logs:retry")
 */

"use strict";

const DLQService = require("./DLQService");
const MetricsService = require("./MetricsService");

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS =
  Number.parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 5;
const INITIAL_RETRY_DELAY_MS =
  Number.parseInt(process.env.INITIAL_RETRY_DELAY_MS, 10) || 1000;
const RETRY_BACKOFF_FACTOR =
  Number.parseFloat(process.env.RETRY_BACKOFF_FACTOR) || 2;

/** Redis Sorted Set key used as the delayed retry queue */
const RETRY_ZSET_KEY =
  process.env.RETRY_STREAM || "logs:retry";

/** How often the RetryPump checks for ready entries (ms) */
const PUMP_INTERVAL_MS = 500;

/** Max entries to promote per pump tick (prevents thundering-herd on backlog) */
const PUMP_BATCH_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate the retry delay for a given attempt index (0-based).
 *
 * @param {number} attemptIndex - 0 for first retry, 1 for second, etc.
 * @returns {number}            - Delay in milliseconds
 */
function getRetryDelay(attemptIndex) {
  return Math.round(
    INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, attemptIndex)
  );
}

// ─── Core retry logic ─────────────────────────────────────────────────────────

/**
 * Schedule a failed log for exponential-backoff retry.
 *
 * If the decoded message has exceeded MAX_RETRY_ATTEMPTS, it is forwarded
 * to the DLQ instead. Otherwise, it is added to the retry sorted set with
 * a score = (now + delay) so the RetryPump promotes it at the right time.
 *
 * @param {object} decoded      - Decoded message: { id, attempts, documentId, serializedLog, log, firstFailureAt }
 * @param {string} reason       - Failure reason (Elasticsearch error message)
 * @param {object} redisClient  - Connected Redis client
 */
async function scheduleRetry(decoded, reason, redisClient) {
  const nextAttempt = decoded.attempts + 1;

  // ── Max retries exceeded ──────────────────────────────────────────────────
  if (nextAttempt >= MAX_RETRY_ATTEMPTS) {
    await DLQService.sendToDLQ(decoded, reason, redisClient);
    await MetricsService.increment(
      MetricsService.METRIC_KEYS.DLQ,
      redisClient
    );
    return;
  }

  // ── Schedule next retry ───────────────────────────────────────────────────
  // attemptIndex is 0-based: first retry uses index 0 → 1s delay
  const attemptIndex = nextAttempt - 1;
  const delayMs = getRetryDelay(attemptIndex);
  const retryAfterMs = Date.now() + delayMs;
  const now = new Date().toISOString();

  const payload = JSON.stringify({
    id: decoded.id,
    attempts: nextAttempt,
    documentId: decoded.documentId || decoded.id,
    serializedLog: decoded.serializedLog,
    firstFailureAt: decoded.firstFailureAt || now,
    lastFailureAt: now,
    lastError: String(reason || "unknown").slice(0, 500),
    // Preserve log reference for structured logging below
    _service: decoded.log?.service || "unknown",
    _traceId: decoded.log?.traceId || "",
    _requestId: decoded.log?.requestId || "",
  });

  // ZADD <key> <score=retryAfterMs> <member=JSON>
  await redisClient.sendCommand([
    "ZADD",
    RETRY_ZSET_KEY,
    String(retryAfterMs),
    payload,
  ]);

  // Track metrics: adds to retryCount + retryDelayTotal
  await MetricsService.addRetryDelay(delayMs, redisClient);

  console.info(
    `[RetryService] Retrying log | attempt=${nextAttempt}/${MAX_RETRY_ATTEMPTS} | delay=${delayMs}ms | traceId=${decoded.log?.traceId || "n/a"} | requestId=${decoded.log?.requestId || "n/a"} | reason=${String(reason || "unknown").slice(0, 120)}`
  );
}

// ─── Retry Pump ───────────────────────────────────────────────────────────────

/**
 * Start the non-blocking RetryPump.
 *
 * Runs on a setInterval every PUMP_INTERVAL_MS. On each tick it:
 *  1. Reads up to PUMP_BATCH_SIZE entries from the ZSET with score <= now
 *  2. For each ready entry, re-adds the log to the main stream
 *  3. Removes the entry from the ZSET
 *
 * The pump never blocks the main consumer loop — it simply fires on a timer
 * and handles its own errors internally.
 *
 * @param {object} redisClient  - Connected Redis client (shared with worker)
 * @param {string} mainStreamKey - The main log stream key (LOG_QUEUE_KEY)
 * @returns {NodeJS.Timeout}    - Interval handle so caller can clear it on shutdown
 */
function startRetryPump(redisClient, mainStreamKey) {
  console.log(
    `[RetryPump] Started — checking "${RETRY_ZSET_KEY}" every ${PUMP_INTERVAL_MS}ms`
  );

  const intervalId = setInterval(async () => {
    try {
      const now = Date.now();

      // Fetch all entries whose scheduled time has arrived
      const members = await redisClient.sendCommand([
        "ZRANGEBYSCORE",
        RETRY_ZSET_KEY,
        "-inf",
        String(now),
        "LIMIT",
        "0",
        String(PUMP_BATCH_SIZE),
      ]);

      if (!Array.isArray(members) || members.length === 0) {
        return;
      }

      for (const member of members) {
        let entry;
        try {
          entry = JSON.parse(member);
        } catch {
          // Corrupt entry — remove and skip
          await redisClient.sendCommand(["ZREM", RETRY_ZSET_KEY, member]);
          console.warn("[RetryPump] Removing corrupt retry entry");
          continue;
        }

        try {
          // Promote back to main stream with updated attempt count
          await redisClient.sendCommand([
            "XADD",
            mainStreamKey,
            "*",
            "log",
            entry.serializedLog,
            "attempts",
            String(entry.attempts),
            "documentId",
            String(entry.documentId || entry.id || ""),
            "firstFailureAt",
            String(entry.firstFailureAt || ""),
            "lastError",
            String(entry.lastError || ""),
          ]);

          // Remove from retry ZSET now that it is in the main stream
          await redisClient.sendCommand(["ZREM", RETRY_ZSET_KEY, member]);

          console.info(
            `[RetryPump] Promoted log back to main stream | attempt=${entry.attempts}/${MAX_RETRY_ATTEMPTS} | id=${entry.id} | service=${entry._service || "n/a"}`
          );
        } catch (err) {
          // Failed to re-add to stream — leave in ZSET, will retry on next pump tick
          console.error(
            `[RetryPump] Failed to promote entry ${entry.id}:`,
            err.message
          );
        }
      }
    } catch (err) {
      // Swallow pump-level errors so the interval keeps running
      console.error("[RetryPump] Pump error:", err.message);
    }
  }, PUMP_INTERVAL_MS);

  return intervalId;
}

module.exports = {
  scheduleRetry,
  startRetryPump,
  getRetryDelay,
  MAX_RETRY_ATTEMPTS,
  RETRY_ZSET_KEY,
};
