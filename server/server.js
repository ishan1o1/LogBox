const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http")
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/logs")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));
;

const LogSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    trim: true,
  },
  level: {
    type: String,
    enum: ["info", "warn", "error", "debug"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 7, 
  },
  meta: {
    type: Object,
    default: {},
  },
});
const Log = mongoose.model("Log", LogSchema);

app.post("/log", async (req, res) => {
  try {
    const log = await Log.create(req.body);
    io.emit("new-log",log);
    res.json({ status: "stored" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/logs", async (req, res) => {
  try {
    const { level, service, start, end, page = 1, limit = 50, search } = req.query;

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

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
});

server.listen(4000, () => {
  console.log("Log server running on 4000");
});
