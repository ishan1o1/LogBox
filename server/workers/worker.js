/**
 * worker.js — LogBox log ingestion worker
 *
 * Reads log entries from a Redis Stream consumer group, bulk-indexes them
 * into Elasticsearch, and handles failures with exponential retry + DLQ.
 *
 * Fault-tolerance flow:
 * ────────────────────────────────────────────────────────────────────────────
 *  Read from stream  →  Bulk index to ES
 *                              │
 *                        ┌─────┴─────┐
 *                        │           │
 *                    Success        Failure
 *                        │           │
 *                       ACK    RetryService.scheduleRetry()
 *                                    │
 *                         ┌──────────┴──────────┐
 *                         │                     │
 *                    attempt < MAX        attempt >= MAX
 *                         │                     │
 *               ZADD logs:retry           DLQService.sendToDLQ()
 *               (with exp. delay)
 *                         │
 *                   RetryPump promotes
 *                   back to main stream
 *                   after delay expires
 */

"use strict";

const os = require("os");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { indexLogs, BulkIndexError, BATCH_SIZE } = require("../services/logBuffer");
const elasticsearchClient = require("../config/elasticsearch");
const createLogsIndex = require("../utils/createIndex");
const {
  LOG_QUEUE_KEY,
  LOG_CONSUMER_GROUP,
  createRedisClient,
  connectRedisClient,
  closeRedisClient,
} = require("../config/redis");

const RetryService = require("./services/RetryService");
const DLQService = require("./services/DLQService");
const MetricsService = require("./services/MetricsService");

// ─── Configuration ────────────────────────────────────────────────────────────

const consumerClient = createRedisClient("worker-consumer");
const CONSUMER_NAME =
  process.env.REDIS_LOG_CONSUMER_NAME || `${os.hostname()}-${process.pid}`;

/** How long XREADGROUP blocks waiting for new messages (ms) */
const STREAM_BLOCK_MS =
  Number.parseInt(process.env.REDIS_STREAM_BLOCK_MS, 10) || 2000;

/** Max messages to read per stream iteration */
const STREAM_READ_COUNT =
  Number.parseInt(process.env.REDIS_STREAM_READ_COUNT, 10) || BATCH_SIZE;

/**
 * Grace period before XAUTOCLAIM reclaims a pending message.
 * Only used so stale messages (from crashed workers) are eventually reclaimed.
 * Retries now go through the exponential retry ZSET, not XAUTOCLAIM.
 */
const STALE_CLAIM_MS =
  Number.parseInt(process.env.REDIS_STALE_CLAIM_MS, 10) || 60_000; // 1 min

/** Back-off before retrying after a fatal worker-level error */
const FATAL_RETRY_BACKOFF_MS = 3000;

let shuttingDown = false;
let retryPumpInterval = null;

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Convert flat [k, v, k, v, …] array to plain object */
function fieldsToObject(fields) {
  if (!Array.isArray(fields)) return fields || {};
  const result = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

/** Parse an XREADGROUP response into [{id, fields}] */
function parseStreamResponse(response) {
  if (!Array.isArray(response)) return [];
  const messages = [];
  response.forEach((stream) => {
    const entries = stream?.[1] || [];
    entries.forEach(([id, fields]) => {
      messages.push({ id, fields: fieldsToObject(fields) });
    });
  });
  return messages;
}

/** Parse an XAUTOCLAIM response into [{id, fields}] */
function parseClaimResponse(response) {
  const entries = Array.isArray(response) ? response[1] || [] : [];
  return entries.map(([id, fields]) => ({ id, fields: fieldsToObject(fields) }));
}

/**
 * Decode a raw stream message into a structured object.
 *
 * The stream may contain fields added by the RetryPump (firstFailureAt,
 * lastError) which we preserve so DLQ entries have accurate history.
 *
 * @param {object} message - { id, fields }
 * @returns {object} decoded - { id, attempts, documentId, serializedLog, log, firstFailureAt, lastError }
 */
function decodeMessage(message) {
  const serializedLog = message.fields.log;
  if (!serializedLog) {
    throw new Error("Missing log field in stream message");
  }

  return {
    id: message.id,
    attempts: Number.parseInt(message.fields.attempts || "0", 10),
    documentId: message.fields.documentId || message.id,
    serializedLog,
    log: JSON.parse(serializedLog),
    // Carry forward failure history from previous retry attempts
    firstFailureAt: message.fields.firstFailureAt || null,
    lastError: message.fields.lastError || null,
  };
}

// ─── Stream operations ────────────────────────────────────────────────────────

/** ACK processed messages so they are removed from the pending entries list */
async function ackMessages(ids) {
  if (!ids.length) return;
  await consumerClient.sendCommand([
    "XACK",
    LOG_QUEUE_KEY,
    LOG_CONSUMER_GROUP,
    ...ids,
  ]);
}

/** Ensure the consumer group exists (idempotent) */
async function ensureConsumerGroup() {
  try {
    await consumerClient.sendCommand([
      "XGROUP",
      "CREATE",
      LOG_QUEUE_KEY,
      LOG_CONSUMER_GROUP,
      "0",
      "MKSTREAM",
    ]);
    console.log(
      `[Worker] Created consumer group "${LOG_CONSUMER_GROUP}" on "${LOG_QUEUE_KEY}"`
    );
  } catch (error) {
    if (!String(error.message || "").includes("BUSYGROUP")) {
      throw error;
    }
    // Group already exists — that's fine
  }
}

/** Read new (undelivered) messages from the stream */
async function readNewMessages() {
  const response = await consumerClient.sendCommand([
    "XREADGROUP",
    "GROUP",
    LOG_CONSUMER_GROUP,
    CONSUMER_NAME,
    "COUNT",
    String(STREAM_READ_COUNT),
    "BLOCK",
    String(STREAM_BLOCK_MS),
    "STREAMS",
    LOG_QUEUE_KEY,
    ">",
  ]);
  return parseStreamResponse(response);
}

/**
 * Claim messages that have been pending too long (e.g. from a crashed worker).
 * Uses STALE_CLAIM_MS as the minimum-idle-time threshold.
 */
async function claimStaleMessages() {
  const response = await consumerClient.sendCommand([
    "XAUTOCLAIM",
    LOG_QUEUE_KEY,
    LOG_CONSUMER_GROUP,
    CONSUMER_NAME,
    String(STALE_CLAIM_MS),
    "0-0",
    "COUNT",
    String(STREAM_READ_COUNT),
  ]);
  return parseClaimResponse(response);
}

// ─── Message processing ───────────────────────────────────────────────────────

/**
 * Process a batch of stream messages:
 *  1. Decode all messages (malformed → immediate DLQ)
 *  2. Bulk-index to Elasticsearch
 *  3. On success → ACK all + increment successCount metric
 *  4. On partial failure (BulkIndexError) → ACK successful, retry failed
 *  5. On total failure → retry all messages
 *
 * @param {Array} messages - Raw stream messages from read/claim
 */
async function processMessages(messages) {
  if (!messages.length) return;

  // ── Decode: separate valid from malformed ─────────────────────────────────
  const decodedMessages = [];

  for (const message of messages) {
    try {
      decodedMessages.push(decodeMessage(message));
    } catch (error) {
      // Malformed message — cannot be retried, goes straight to DLQ
      await DLQService.sendToDLQ(
        {
          id: message.id,
          attempts: Number.parseInt(message.fields.attempts || "0", 10),
          documentId: message.fields.documentId || message.id,
          serializedLog:
            message.fields.log || JSON.stringify(message.fields),
          log: {},
          firstFailureAt: null,
        },
        `Malformed stream message: ${error.message}`,
        consumerClient
      );
      await MetricsService.increment(
        MetricsService.METRIC_KEYS.DLQ,
        consumerClient
      );
      await ackMessages([message.id]);
    }
  }

  if (!decodedMessages.length) return;

  // ── Build ES document list ───────────────────────────────────────────────
  const logs = decodedMessages.map((msg) => ({
    ...msg.log,
    _esDocumentId: msg.documentId,
  }));

  // ── Attempt bulk index ────────────────────────────────────────────────────
  try {
    await indexLogs(logs);
    // Full success — ACK and count all
    await ackMessages(decodedMessages.map((msg) => msg.id));
    await MetricsService.increment(
      MetricsService.METRIC_KEYS.SUCCESS,
      consumerClient,
      decodedMessages.length
    );

    console.info(
      `[Worker] Successfully indexed ${decodedMessages.length} log(s)`
    );
  } catch (error) {
    // ── Partial failure (some docs failed, some succeeded) ────────────────
    if (error instanceof BulkIndexError) {
      const failedIndexes = new Set(
        error.failedItems.map((item) => item.index)
      );
      const successfulMessages = decodedMessages.filter(
        (_, i) => !failedIndexes.has(i)
      );
      const failedMessages = decodedMessages.filter((_, i) =>
        failedIndexes.has(i)
      );

      // ACK and count successful ones
      if (successfulMessages.length) {
        await ackMessages(successfulMessages.map((msg) => msg.id));
        await MetricsService.increment(
          MetricsService.METRIC_KEYS.SUCCESS,
          consumerClient,
          successfulMessages.length
        );
      }

      // Schedule retries for failed ones
      await MetricsService.increment(
        MetricsService.METRIC_KEYS.FAILURE,
        consumerClient,
        failedMessages.length
      );
      for (const failedMsg of failedMessages) {
        await RetryService.scheduleRetry(
          failedMsg,
          error.message,
          consumerClient
        );
        // ACK: message is now owned by RetryService (in ZSET)
        await ackMessages([failedMsg.id]);
      }
      return;
    }

    // ── Total failure (ES cluster unreachable, timeout, etc.) ─────────────
    await MetricsService.increment(
      MetricsService.METRIC_KEYS.FAILURE,
      consumerClient
    );

    for (const msg of decodedMessages) {
      await RetryService.scheduleRetry(msg, error.message, consumerClient);
      await ackMessages([msg.id]);
    }
  }
}

// ─── Main consumer loop ───────────────────────────────────────────────────────

/**
 * Main worker loop.
 *
 * Priority: claim + process stale messages first (prevents a stuck
 * consumer from blocking progress), then read new messages.
 */
async function consumeLogs() {
  await connectRedisClient(consumerClient);
  await ensureConsumerGroup();
  await createLogsIndex();
  await elasticsearchClient.ping();

  // Record worker start time in metrics (NX = only if not already set)
  await MetricsService.markUptimeStart(consumerClient);

  // Start the non-blocking retry pump — runs independently on its own timer
  retryPumpInterval = RetryService.startRetryPump(
    consumerClient,
    LOG_QUEUE_KEY
  );

  console.log(
    `[Worker] Listening on "${LOG_QUEUE_KEY}" as consumer "${CONSUMER_NAME}" | maxRetries=${RetryService.MAX_RETRY_ATTEMPTS}`
  );

  while (!shuttingDown) {
    try {
      // 1. Claim and process any stale pending messages first
      const staleMessages = await claimStaleMessages();
      if (staleMessages.length) {
        await processMessages(staleMessages);
        continue; // Re-check stale before reading new
      }

      // 2. Read new messages (blocking up to STREAM_BLOCK_MS)
      const messages = await readNewMessages();
      await processMessages(messages);
    } catch (error) {
      if (shuttingDown) break;

      console.error("[Worker] Main loop error:", error.message);
      await sleep(FATAL_RETRY_BACKOFF_MS);
    }
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("[Worker] Shutting down gracefully…");
  shuttingDown = true;

  if (retryPumpInterval) {
    clearInterval(retryPumpInterval);
    retryPumpInterval = null;
  }

  await Promise.allSettled([
    closeRedisClient(consumerClient),
    elasticsearchClient.close(),
  ]);

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Entrypoint ───────────────────────────────────────────────────────────────

consumeLogs().catch(async (error) => {
  console.error("[Worker] Fatal startup error:", error.message);
  await shutdown();
});