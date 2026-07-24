/**
 * MetricsService.js
 *
 * Redis-backed metrics counter shared between the worker process (writes)
 * and the API server process (reads via GET /metrics).
 *
 * Uses a Redis Hash (HINCRBY) so all worker replicas and the API server
 * can increment and read the same counters without in-process state.
 *
 * Keys stored in the hash `logbox:metrics`:
 *   successCount      — logs successfully indexed to Elasticsearch
 *   failureCount      — logs that failed initial indexing
 *   retryCount        — total retry attempts (across all attempts)
 *   dlqCount          — logs permanently moved to the Dead Letter Queue
 *   replayCount       — logs manually replayed from the DLQ
 *   retryDelayTotal   — sum of all retry delay durations (ms), for avg calculation
 *   uptimeSince       — ISO timestamp when the worker first started
 */

"use strict";

const METRICS_HASH_KEY = "logbox:metrics";

/** Canonical metric key names — use these everywhere to avoid typos. */
const METRIC_KEYS = Object.freeze({
  SUCCESS: "successCount",
  FAILURE: "failureCount",
  RETRY: "retryCount",
  DLQ: "dlqCount",
  REPLAY: "replayCount",
  RETRY_DELAY_TOTAL: "retryDelayTotal",
});

/**
 * Atomically increment a metric counter by `by` (default 1).
 *
 * @param {string} metric      - One of METRIC_KEYS values
 * @param {object} redisClient - Connected Redis client
 * @param {number} [by=1]      - Amount to increment
 */
async function increment(metric, redisClient, by = 1) {
  try {
    await redisClient.sendCommand([
      "HINCRBY",
      METRICS_HASH_KEY,
      metric,
      String(by),
    ]);
  } catch (err) {
    // Non-fatal: log but never throw — metrics must never crash the pipeline
    console.warn(`[MetricsService] Failed to increment "${metric}":`, err.message);
  }
}

/**
 * Record a retry delay for computing average retry delay.
 * Increments both retryCount and retryDelayTotal atomically.
 *
 * @param {number} delayMs     - The scheduled delay in milliseconds
 * @param {object} redisClient - Connected Redis client
 */
async function addRetryDelay(delayMs, redisClient) {
  try {
    await redisClient.sendCommand([
      "HINCRBY",
      METRICS_HASH_KEY,
      METRIC_KEYS.RETRY,
      "1",
    ]);
    await redisClient.sendCommand([
      "HINCRBY",
      METRICS_HASH_KEY,
      METRIC_KEYS.RETRY_DELAY_TOTAL,
      String(Math.round(delayMs)),
    ]);
  } catch (err) {
    console.warn("[MetricsService] Failed to record retry delay:", err.message);
  }
}

/**
 * Read and return a full metrics snapshot.
 * Converts the flat Redis HGETALL array into a typed object.
 *
 * @param {object} redisClient - Connected Redis client
 * @returns {Promise<object>}  - Metrics snapshot
 */
async function getSnapshot(redisClient) {
  try {
    // HGETALL returns flat array: [key, val, key, val, ...]
    const raw = await redisClient.sendCommand(["HGETALL", METRICS_HASH_KEY]);

    const data = {};
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        data[raw[i]] = raw[i + 1];
      }
    }

    const retryCount = Number.parseInt(data[METRIC_KEYS.RETRY] || "0", 10);
    const retryDelayTotal = Number.parseInt(
      data[METRIC_KEYS.RETRY_DELAY_TOTAL] || "0",
      10
    );

    return {
      successCount: Number.parseInt(data[METRIC_KEYS.SUCCESS] || "0", 10),
      failureCount: Number.parseInt(data[METRIC_KEYS.FAILURE] || "0", 10),
      retryCount,
      dlqCount: Number.parseInt(data[METRIC_KEYS.DLQ] || "0", 10),
      replayCount: Number.parseInt(data[METRIC_KEYS.REPLAY] || "0", 10),
      avgRetryDelayMs:
        retryCount > 0 ? Math.round(retryDelayTotal / retryCount) : 0,
      uptimeSince: data.uptimeSince || null,
      collectedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[MetricsService] Failed to get snapshot:", err.message);
    return {
      successCount: 0,
      failureCount: 0,
      retryCount: 0,
      dlqCount: 0,
      replayCount: 0,
      avgRetryDelayMs: 0,
      uptimeSince: null,
      collectedAt: new Date().toISOString(),
      error: "metrics_unavailable",
    };
  }
}

/**
 * Set `uptimeSince` on first worker startup (using HSETNX so subsequent
 * restarts don't overwrite the original start time).
 *
 * @param {object} redisClient - Connected Redis client
 */
async function markUptimeStart(redisClient) {
  try {
    await redisClient.sendCommand([
      "HSETNX",
      METRICS_HASH_KEY,
      "uptimeSince",
      new Date().toISOString(),
    ]);
  } catch (err) {
    console.warn("[MetricsService] Failed to mark uptime start:", err.message);
  }
}

module.exports = {
  increment,
  addRetryDelay,
  getSnapshot,
  markUptimeStart,
  METRIC_KEYS,
  METRICS_HASH_KEY,
};
