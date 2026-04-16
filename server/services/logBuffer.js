const client = require("../config/elasticsearch")
const WRITE_LOGS_INDEX = process.env.ELASTICSEARCH_WRITE_INDEX || "logs";

let logBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL = 2000;
const MAX_BUFFER = 5000;

async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];

  try {
    const body = logsToInsert.flatMap((log) => {
      const meta = (log.meta && typeof log.meta === "object") ? log.meta : {};
      return [
        { index: { _index: WRITE_LOGS_INDEX, _id: log.traceId || undefined } },
        {
          timestamp: log.timestamp || new Date(),

          level: log.level || "INFO",
          message: log.message || "",
          service: log.service || "general",
          source: log.source || "unknown",

          // ✅ Prefer meta, fallback to root
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

          // Optional
          stack: meta.stack ?? log.stack ?? null,
          environment: log.environment ?? "unknown",

          // RCA fields
          eventType: meta.eventType ?? log.eventType ?? "GENERAL",
          dependency: meta.dependency ?? log.dependency ?? null,
          errorFingerprint: meta.errorFingerprint ?? log.errorFingerprint ?? null,
          severityScore: meta.severityScore ?? log.severityScore ?? 1,
          stage: meta.stage ?? log.stage ?? null,
        },
      ]
    });

    const response = await client.bulk({ refresh: true, body });

    if (response.errors) {
      console.error("❌ Some logs failed to index");
    } else {
      console.log(`✅ Inserted ${logsToInsert.length} logs into Elasticsearch`);
    }
  } catch (err) {
    console.error("❌ Batch insert failed:", err.message);
  }
}

// push log into buffer

function addLog(log) {
  if (logBuffer.length >= MAX_BUFFER) {
    console.warn("⚠️ Buffer overflow, dropping logs");
    return;
  }

  logBuffer.push(log);

  if (logBuffer.length >= BATCH_SIZE) {
    flushLogs();
  }
}

// start interval
setInterval(flushLogs, FLUSH_INTERVAL);

module.exports = {
  addLog,
};
