const Log = require("./models/Log");

let logBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL = 2000;
const MAX_BUFFER = 5000;

async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];

  try {
    await Log.insertMany(logsToInsert);
    console.log(`✅ Inserted ${logsToInsert.length} logs`);
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