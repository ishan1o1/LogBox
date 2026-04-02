const client = require("../config/elasticsearch")

let logBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL = 2000;
const MAX_BUFFER = 5000;

async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];

  try {
    const body = logsToInsert.flatMap((log) => [
      { index: { _index: "logs",_id: log.traceId || undefined } },
      {
        timestamp: log.timestamp || new Date(),
        level: log.level || "INFO",
        source: log.source || "unknown",
        service: log.service || "general",
        endpoint: log.endpoint || "",
        message: log.message || "",
        statusCode: log.statusCode || 200,
        errorType: log.errorType || "NONE",
        traceId: log.traceId || null,
      },
    ]);

    const response = await client.bulk({ body });

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