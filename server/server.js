require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http")
const { Server } = require("socket.io");
const {addLog} = require("./services/logBuffer");
const Log = require("./models/log")

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// const MONGO_URI = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/?${process.env.MONGO_OPTIONS}`;

const MONGO_URI = 'mongodb://localhost:27017/logs'

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));
;



app.post("/log", async (req, res) => {
   console.log("HIT:", req.body);
  try {
    const log = req.body;
    addLog(log);
    io.emit("new-log",log);
    res.json({ status: "stored" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/logs", async (req, res) => {
  try {
    const { level, service, start, end, page = 1, limit = 1000, search } = req.query;

    let filter = {};

    if (level) filter.level = level;
    if (service) filter.service = service;

    if (search) {
      filter.message = { $regex: search, $options: "i" };
    }

    if (start || end) {
      filter.timestamp = {};
      if (start) filter.timestamp.$gte = new Date(start);
      if (end) filter.timestamp.$lte = new Date(end);
    }

    const logs = await Log.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Aggregated stats for the chart — returns per-minute, per-level counts
// Never paginated — always reflects ALL logs in the selected time window
app.get("/logs/stats", async (req, res) => {
  try {
    const { start, end } = req.query;

    let match = {};
    if (start || end) {
      match.timestamp = {};
      if (start) match.timestamp.$gte = new Date(start);
      if (end)   match.timestamp.$lte = new Date(end);
    }

    const stats = await Log.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            // Group by minute bucket + level
            minute: {
              $dateToString: { format: "%Y-%m-%d %H:%M", date: "$timestamp" }
            },
            level: "$level",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.minute": 1 } },
    ]);

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Error rate endpoint — calculates % of logs that are ERROR.
app.get("/logs/error-rate", async (req, res) => {
  try {
    const { start, end } = req.query;

    let match = {};
    if (start || end) {
      match.timestamp = {};
      if (start) match.timestamp.$gte = new Date(start);
      if (end)   match.timestamp.$lte = new Date(end);
    }

    const stats = await Log.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$service",
          totalLogs: { $sum: 1 },
          errorLogs: { 
            $sum: { $cond: [{ $eq: ["$level", "ERROR"] }, 1, 0] } 
          }
        }
      },
      {
        $project: {
          service: "$_id",
          totalLogs: 1,
          errorLogs: 1,
          errorRate: {
            $cond: [
              { $eq: ["$totalLogs", 0] },
              0,
              { $multiply: [{ $divide: ["$errorLogs", "$totalLogs"] }, 100] }
            ]
          },
          _id: 0
        }
      },
      { $sort: { errorRate: -1 } }
    ]);

    const globalStats = stats.reduce((acc, curr) => {
      acc.totalLogs += curr.totalLogs;
      acc.errorLogs += curr.errorLogs;
      return acc;
    }, { totalLogs: 0, errorLogs: 0 });

    const globalErrorRate = globalStats.totalLogs === 0 
      ? 0 
      : (globalStats.errorLogs / globalStats.totalLogs) * 100;

    res.json({
      globalErrorRate,
      globalTotalLogs: globalStats.totalLogs,
      globalErrorLogs: globalStats.errorLogs,
      services: stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Log server running on ${PORT}`);
});
