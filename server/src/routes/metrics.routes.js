/**
 * metrics.routes.js — Ingestion pipeline metrics API
 *
 * Exposes a snapshot of live ingestion metrics stored in Redis.
 * Counters are written by the worker process via MetricsService and
 * read here by the API server process.
 *
 * Routes:
 *   GET /metrics — return metrics snapshot (ADMIN + DEVELOPER)
 *
 * Future: add a Prometheus text-format endpoint at /metrics/prometheus
 * for scraping by a Prometheus server.
 */

"use strict";

const express = require("express");
const router = express.Router();

const { asyncHandler } = require("../utils/errors");
const MetricsService = require("../../workers/services/MetricsService");
const DLQService = require("../../workers/services/DLQService");
const { RETRY_ZSET_KEY, createRedisClient, connectRedisClient } = require("../../config/redis");

// ─── Shared metrics Redis client ──────────────────────────────────────────────

let _metricsClient = null;

async function getMetricsClient() {
  if (!_metricsClient) {
    _metricsClient = createRedisClient("metrics-api");
  }
  await connectRedisClient(_metricsClient);
  return _metricsClient;
}

// ─── GET /metrics — Full snapshot ─────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await getMetricsClient();

    // Fetch all metrics in parallel for low latency
    const [snapshot, dlqLength, pendingRetries] = await Promise.all([
      MetricsService.getSnapshot(client),
      DLQService.getDLQLength(client),
      // Count entries currently waiting in the retry ZSET
      client.sendCommand(["ZCARD", RETRY_ZSET_KEY]).catch(() => 0),
    ]);

    res.json({
      ...snapshot,
      // Live queue depths (not stored in metrics hash — read real-time)
      dlqDepth: dlqLength,
      pendingRetries: Number.parseInt(pendingRetries || "0", 10),
    });
  })
);

module.exports = router;
