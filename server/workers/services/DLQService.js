/**
 * DLQService.js
 *
 * Manages the Dead Letter Queue (DLQ) — a dedicated Redis Stream (`logs:dlq`)
 * where permanently-failed logs land after exhausting all retry attempts.
 *
 * Responsibilities:
 *  - Write enriched DLQ entries (sendToDLQ)
 *  - Read / paginate DLQ entries (listDLQ, getDLQEntry, getAllDLQEntries)
 *  - Delete individual entries (deleteDLQEntry)
 *  - Support replay by exposing raw log data for re-ingestion into main stream
 *
 * Stream key: `logs:dlq`  (configurable via DLQ_STREAM env var)
 *
 * Each entry in the stream stores flat string fields (Redis Stream limitation):
 *   log           — JSON-serialised original log payload
 *   attempt       — total number of attempts made (always >= MAX_RETRY_ATTEMPTS)
 *   firstFailureAt — ISO timestamp of the very first failure
 *   lastFailureAt  — ISO timestamp of the most recent failure
 *   lastError      — human-readable error message from Elasticsearch
 *   failedAt       — ISO timestamp when this entry was written to DLQ
 *   service        — log.service field (for quick filtering)
 *   endpoint       — log.endpoint or log.route (for quick filtering)
 *   traceId        — log.traceId (for correlation)
 *   requestId      — log.requestId (for correlation)
 *   documentId     — the original stream message ID
 *   message        — log.message (preview)
 *   level          — log.level
 */

"use strict";

const DLQ_STREAM_KEY =
  process.env.DLQ_STREAM ||
  process.env.REDIS_LOG_DLQ_KEY ||
  "logbox:logs:stream:dlq";

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Convert a flat Redis Stream fields array [k, v, k, v, …]
 * into a plain object. Handles both array and already-object forms.
 */
function fieldsToObject(fields) {
  if (!Array.isArray(fields)) return fields || {};
  const result = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}

/**
 * Parse a raw Redis Stream entry into a clean, typed DLQ entry object.
 *
 * @param {string} id     - Redis Stream entry ID (e.g. "1722000000000-0")
 * @param {object} fields - Flat key/value fields from the stream
 * @returns {object}      - Typed DLQ entry
 */
function parseDLQEntry(id, fields) {
  let rawLog = {};
  try {
    rawLog = JSON.parse(fields.log || "{}");
  } catch {
    rawLog = {};
  }

  return {
    id,
    attempt: Number.parseInt(fields.attempt || "0", 10),
    firstFailureAt: fields.firstFailureAt || null,
    lastFailureAt: fields.lastFailureAt || null,
    lastError: fields.lastError || "unknown",
    failedAt: fields.failedAt || null,
    service: fields.service || "unknown",
    endpoint: fields.endpoint || "unknown",
    traceId: fields.traceId || null,
    requestId: fields.requestId || null,
    documentId: fields.documentId || id,
    message: fields.message || "",
    level: fields.level || "UNKNOWN",
    rawLog,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Write a failed log to the Dead Letter Queue with full diagnostic metadata.
 *
 * This is called by the worker when a log has exhausted all retry attempts.
 * Never throws — if the DLQ write fails, we log the error and move on to avoid
 * blocking the worker pipeline.
 *
 * @param {object} decoded      - Decoded message from the worker (id, attempts, log, serializedLog, …)
 * @param {string} reason       - Human-readable failure reason (e.g. Elasticsearch error message)
 * @param {object} redisClient  - Connected Redis client
 */
async function sendToDLQ(decoded, reason, redisClient) {
  const log = decoded.log || {};
  const now = new Date().toISOString();

  await redisClient.sendCommand([
    "XADD",
    DLQ_STREAM_KEY,
    "*",
    "log",
    decoded.serializedLog || JSON.stringify(log),
    "attempt",
    String(decoded.attempts + 1),
    "firstFailureAt",
    decoded.firstFailureAt || now,
    "lastFailureAt",
    now,
    "lastError",
    String(reason || "unknown").slice(0, 500), // cap at 500 chars
    "failedAt",
    now,
    "service",
    String(log.service || "unknown"),
    "endpoint",
    String(log.endpoint || log.route || "unknown"),
    "traceId",
    String(log.traceId || ""),
    "requestId",
    String(log.requestId || ""),
    "documentId",
    String(decoded.documentId || decoded.id || ""),
    "message",
    String(log.message || "").slice(0, 500), // cap at 500 chars for stream efficiency
    "level",
    String(log.level || "UNKNOWN"),
  ]);

  console.error(
    `[DLQService] Log moved to DLQ | attempts=${decoded.attempts + 1} | reason=${reason} | service=${log.service || "unknown"} | traceId=${log.traceId || "n/a"} | requestId=${log.requestId || "n/a"}`
  );
}

/**
 * List DLQ entries with cursor-based forward pagination.
 *
 * Uses XRANGE for efficient range scans. The cursor is the last-seen
 * stream ID; pass "-" to start from the beginning.
 *
 * @param {object} options
 * @param {string} [options.cursor="-"]  - Stream ID to start after ("-" = beginning)
 * @param {number} [options.count=50]    - Max entries to return per page
 * @param {object} redisClient           - Connected Redis client
 * @returns {Promise<{entries: object[], nextCursor: string|null, total: number}>}
 */
async function listDLQ({ cursor = "-", count = 50 } = {}, redisClient) {
  // Use exclusive lower bound when cursor is a real ID (not the sentinel "-")
  const lowerBound = cursor === "-" ? "-" : `(${cursor}`;

  const [rangeResponse, lenResponse] = await Promise.all([
    redisClient.sendCommand([
      "XRANGE",
      DLQ_STREAM_KEY,
      lowerBound,
      "+",
      "COUNT",
      String(count),
    ]),
    redisClient.sendCommand(["XLEN", DLQ_STREAM_KEY]),
  ]);

  const entries = Array.isArray(rangeResponse)
    ? rangeResponse.map(([id, fields]) =>
        parseDLQEntry(id, fieldsToObject(fields))
      )
    : [];

  const nextCursor =
    entries.length === count ? entries[entries.length - 1].id : null;

  return {
    entries,
    nextCursor,
    total: Number.parseInt(lenResponse || "0", 10),
  };
}

/**
 * Retrieve a single DLQ entry by its Redis Stream ID.
 *
 * @param {string} id           - Redis Stream entry ID (e.g. "1722000000000-0")
 * @param {object} redisClient  - Connected Redis client
 * @returns {Promise<object|null>}
 */
async function getDLQEntry(id, redisClient) {
  const response = await redisClient.sendCommand([
    "XRANGE",
    DLQ_STREAM_KEY,
    id,
    id,
  ]);

  if (!Array.isArray(response) || !response.length) return null;

  const [entryId, fields] = response[0];
  return parseDLQEntry(entryId, fieldsToObject(fields));
}

/**
 * Permanently delete a single DLQ entry by stream ID.
 *
 * @param {string} id           - Redis Stream entry ID
 * @param {object} redisClient  - Connected Redis client
 * @returns {Promise<boolean>}  - true if deleted, false if not found
 */
async function deleteDLQEntry(id, redisClient) {
  const deleted = await redisClient.sendCommand(["XDEL", DLQ_STREAM_KEY, id]);
  return Number(deleted) > 0;
}

/**
 * Read ALL DLQ entries (no pagination). Used for bulk replay.
 * Use with caution on large DLQs.
 *
 * @param {object} redisClient - Connected Redis client
 * @returns {Promise<object[]>}
 */
async function getAllDLQEntries(redisClient) {
  const response = await redisClient.sendCommand([
    "XRANGE",
    DLQ_STREAM_KEY,
    "-",
    "+",
  ]);

  if (!Array.isArray(response)) return [];

  return response.map(([id, fields]) =>
    parseDLQEntry(id, fieldsToObject(fields))
  );
}

/**
 * Get the total count of entries currently in the DLQ.
 *
 * @param {object} redisClient - Connected Redis client
 * @returns {Promise<number>}
 */
async function getDLQLength(redisClient) {
  const len = await redisClient.sendCommand(["XLEN", DLQ_STREAM_KEY]);
  return Number.parseInt(len || "0", 10);
}

module.exports = {
  sendToDLQ,
  listDLQ,
  getDLQEntry,
  deleteDLQEntry,
  getAllDLQEntries,
  getDLQLength,
  DLQ_STREAM_KEY,
};
