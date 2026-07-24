const client = require("../config/elasticsearch");

const WRITE_LOGS_INDEX = process.env.ELASTICSEARCH_WRITE_INDEX || "logs";

const BATCH_SIZE = Number.parseInt(process.env.LOG_BUFFER_BATCH_SIZE, 10) || 50;
const FLUSH_INTERVAL = Number.parseInt(process.env.LOG_BUFFER_FLUSH_INTERVAL_MS, 10) || 2000;
const MAX_BUFFER = Number.parseInt(process.env.LOG_BUFFER_MAX_SIZE, 10) || 5000;

let logBuffer = [];
let flushInFlight = null;

class BulkIndexError extends Error {
  constructor(message, failedItems) {
    super(message);
    this.name = "BulkIndexError";
    this.failedItems = failedItems;
  }
}

function average(values) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function serializeLog(log) {
  const meta = log.meta && typeof log.meta === "object" ? log.meta : {};

  return {
    timestamp: log.timestamp || new Date(),
    level: log.level || "INFO",
    message: log.message || "",
    service: log.service || "general",
    source: log.source || "unknown",
    route: meta.route ?? log.route ?? null,
    method: meta.method ?? log.method ?? null,
    endpoint: meta.endpoint ?? log.endpoint ?? null,
    statusCode: meta.statusCode ?? log.statusCode ?? 200,
    responseTime: meta.responseTime ?? log.responseTime ?? null,
    traceId: meta.traceId ?? log.traceId ?? null,
    requestId: meta.requestId ?? log.requestId ?? null,
    deploymentId: meta.deploymentId ?? log.deploymentId ?? null,
    host: meta.host ?? log.host ?? null,
    errorType: log.errorType ?? meta.errorType ?? "NONE",
    stack: meta.stack ?? log.stack ?? null,
    environment: log.environment ?? meta.environment ?? "unknown",
    eventType: meta.eventType ?? log.eventType ?? "GENERAL",
    dependency: meta.dependency ?? log.dependency ?? null,
    errorFingerprint: meta.errorFingerprint ?? log.errorFingerprint ?? null,
    severityScore: meta.severityScore ?? log.severityScore ?? 1,
    stage: meta.stage ?? log.stage ?? null,
  };
}

function buildBulkBody(logs) {
  return logs.flatMap((log) => {
    const documentId = log._esDocumentId || log.id || log.logId || log.eventId;

    return [
      { index: { _index: WRITE_LOGS_INDEX, _id: documentId || undefined } },
      serializeLog(log),
    ];
  });
}

async function indexLogs(logs) {
  if (!logs.length) {
    return { count: 0, bulkLatencyMs: 0 };
  }

  const flushStartedAt = Date.now();
  const body = buildBulkBody(logs);
  const response = await client.bulk({ refresh: false, body });
  const flushCompletedAt = Date.now();
  const bulkLatencyMs = flushCompletedAt - flushStartedAt;

  const queueLatencies = logs
    .map((log) => {
      const receivedAt = Number(log._receivedAt || 0);
      return receivedAt > 0 ? flushStartedAt - receivedAt : null;
    })
    .filter((value) => value != null);
  const totalLatencies = logs
    .map((log) => {
      const receivedAt = Number(log._receivedAt || 0);
      return receivedAt > 0 ? flushCompletedAt - receivedAt : null;
    })
    .filter((value) => value != null);

  if (response.errors) {
    const failedItems = (response.items || [])
      .map((item, index) => ({ index, error: item.index?.error }))
      .filter((item) => item.error);

    console.error(
      `[ES] Partial index failure - ${failedItems.length}/${logs.length} docs failed | bulk=${bulkLatencyMs}ms | queueAvg=${average(queueLatencies)}ms | totalAvg=${average(totalLatencies)}ms`
    );
    throw new BulkIndexError("Elasticsearch bulk request had partial failures", failedItems);
  }

  console.log(
    `[ES] Indexed ${logs.length} logs | bulk=${bulkLatencyMs}ms | queueAvg=${average(queueLatencies)}ms | totalAvg=${average(totalLatencies)}ms`
  );

  return { count: logs.length, bulkLatencyMs };
}

async function flushLogs() {
  if (flushInFlight) {
    return flushInFlight;
  }
  if (logBuffer.length === 0) {
    return { count: 0, bulkLatencyMs: 0 };
  }

  const logsToInsert = logBuffer.splice(0, logBuffer.length);

  flushInFlight = indexLogs(logsToInsert)
    .catch((err) => {
      const availableSlots = Math.max(MAX_BUFFER - logBuffer.length, 0);
      logBuffer = logsToInsert.slice(0, availableSlots).concat(logBuffer);
      console.error("[ES] Batch insert failed:", err.message);
      throw err;
    })
    .finally(() => {
      flushInFlight = null;
    });

  return flushInFlight;
}

function addLog(log) {
  if (logBuffer.length >= MAX_BUFFER) {
    console.warn("Buffer overflow, dropping log");
    return false;
  }

  logBuffer.push(log);

  if (logBuffer.length >= BATCH_SIZE) {
    flushLogs().catch(() => {});
  }

  return true;
}

setInterval(() => {
  flushLogs().catch(() => {});
}, FLUSH_INTERVAL);

module.exports = {
  addLog,
  flushLogs,
  indexLogs,
  BulkIndexError,
  BATCH_SIZE,
};