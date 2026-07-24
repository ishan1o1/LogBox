/**
 * dlq.routes.js — Dead Letter Queue management API
 *
 * All routes require JWT authentication (applied by the outer router in server.js).
 * Individual replay/delete operations additionally require ADMIN role.
 *
 * Routes:
 *   GET    /dlq              — list DLQ entries (ADMIN + DEVELOPER)
 *   GET    /dlq/:id          — get single DLQ entry (ADMIN + DEVELOPER)
 *   POST   /dlq/replay/:id   — replay one failed log (ADMIN)
 *   POST   /dlq/replay       — replay ALL failed logs (ADMIN)
 *   DELETE /dlq/:id          — permanently delete a DLQ entry (ADMIN)
 *
 * Replay flow:
 *   1. Read the original serialised log from the DLQ entry
 *   2. Re-add it to the main stream with attempts=0 (fresh delivery)
 *   3. Delete the DLQ entry
 *   4. Increment replay metric
 */

"use strict";

const express = require("express");
const router = express.Router();

const authorizeRoles = require("../middleware/authorizeRoles");
const { asyncHandler, AppError } = require("../utils/errors");
const { ROLES } = require("../models/User");

const DLQService = require("../../workers/services/DLQService");
const MetricsService = require("../../workers/services/MetricsService");

const {
  LOG_QUEUE_KEY,
  createRedisClient,
  connectRedisClient,
} = require("../../config/redis");

// ─── DLQ Redis client (dedicated connection for DLQ API reads/writes) ─────────
//
// The DLQ API runs in the server process (not the worker), so it needs its
// own Redis connection. It is created lazily on first request.

let _dlqClient = null;

async function getDLQClient() {
  if (!_dlqClient) {
    _dlqClient = createRedisClient("dlq-api");
  }
  await connectRedisClient(_dlqClient);
  return _dlqClient;
}

// ─── GET /dlq — List DLQ entries ─────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const client = await getDLQClient();

    const cursor = req.query.cursor || "-";
    const count = Math.min(
      Number.parseInt(req.query.count || "50", 10) || 50,
      200 // max 200 per page
    );

    const result = await DLQService.listDLQ({ cursor, count }, client);

    res.json({
      entries: result.entries,
      nextCursor: result.nextCursor,
      total: result.total,
      page: { cursor, count },
    });
  })
);

// ─── GET /dlq/:id — Get single DLQ entry ──────────────────────────────────────

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const client = await getDLQClient();
    const entry = await DLQService.getDLQEntry(req.params.id, client);

    if (!entry) {
      throw new AppError(404, "DLQ entry not found");
    }

    res.json({ entry });
  })
);

// ─── POST /dlq/replay/:id — Replay single entry ───────────────────────────────

router.post(
  "/replay/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const client = await getDLQClient();
    const entry = await DLQService.getDLQEntry(req.params.id, client);

    if (!entry) {
      throw new AppError(404, "DLQ entry not found");
    }

    const serializedLog = entry.rawLog
      ? JSON.stringify(entry.rawLog)
      : JSON.stringify({});

    // Re-add to main stream with fresh attempt counter
    await client.sendCommand([
      "XADD",
      LOG_QUEUE_KEY,
      "*",
      "log",
      serializedLog,
      "attempts",
      "0",
      "documentId",
      entry.documentId || entry.id,
      // Tag so the worker knows this is a replay
      "replayedFrom",
      entry.id,
      "replayedAt",
      new Date().toISOString(),
    ]);

    // Remove from DLQ
    await DLQService.deleteDLQEntry(entry.id, client);

    // Track replay metric
    await MetricsService.increment(MetricsService.METRIC_KEYS.REPLAY, client);

    console.info(
      `[DLQ] Replay successful | logId=${entry.id} | service=${entry.service} | replayed by user=${req.user?.email || "unknown"}`
    );

    res.json({
      message: "Log successfully replayed",
      replayedId: entry.id,
      service: entry.service,
    });
  })
);

// ─── POST /dlq/replay — Replay ALL entries ─────────────────────────────────────

router.post(
  "/replay",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const client = await getDLQClient();
    const entries = await DLQService.getAllDLQEntries(client);

    if (!entries.length) {
      return res.json({ message: "DLQ is empty — nothing to replay", replayed: 0 });
    }

    let replayed = 0;
    const errors = [];

    for (const entry of entries) {
      try {
        const serializedLog = entry.rawLog
          ? JSON.stringify(entry.rawLog)
          : JSON.stringify({});

        await client.sendCommand([
          "XADD",
          LOG_QUEUE_KEY,
          "*",
          "log",
          serializedLog,
          "attempts",
          "0",
          "documentId",
          entry.documentId || entry.id,
          "replayedFrom",
          entry.id,
          "replayedAt",
          new Date().toISOString(),
        ]);

        await DLQService.deleteDLQEntry(entry.id, client);
        replayed++;
      } catch (err) {
        errors.push({ id: entry.id, error: err.message });
      }
    }

    // Bulk increment replay metric
    if (replayed > 0) {
      await MetricsService.increment(
        MetricsService.METRIC_KEYS.REPLAY,
        client,
        replayed
      );
    }

    console.info(
      `[DLQ] Bulk replay completed | replayed=${replayed}/${entries.length} | errors=${errors.length} | by=${req.user?.email || "unknown"}`
    );

    res.json({
      message: `Replayed ${replayed} of ${entries.length} log(s)`,
      replayed,
      total: entries.length,
      errors: errors.length ? errors : undefined,
    });
  })
);

// ─── DELETE /dlq/:id — Delete a DLQ entry ─────────────────────────────────────

router.delete(
  "/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const client = await getDLQClient();
    const deleted = await DLQService.deleteDLQEntry(req.params.id, client);

    if (!deleted) {
      throw new AppError(404, "DLQ entry not found");
    }

    console.info(
      `[DLQ] Entry deleted | id=${req.params.id} | by=${req.user?.email || "unknown"}`
    );

    res.status(204).send();
  })
);

module.exports = router;
