require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http")
const { Server } = require("socket.io");
const {addLog} = require("./services/logBuffer");
const Log = require("./models/log")
const createLogsIndex = require("./utils/createIndex");
const app = express();
const rcaRoutes = require("./modules/rca/rca.routes")
const server = http.createServer(app);


const io = new Server(server, {
  cors: { origin: "*" }
});
app.set("io",io);

app.use(cors());
app.use(express.json());

app.use("/rca",rcaRoutes);
const client = require("./config/elasticsearch");

(async () => {
  try {
    const response = await client.info();
    console.log("✅ Connected to Elasticsearch");
    console.log(response);
  } catch (err) {
    console.error("❌ Elasticsearch connection failed:", err.message);
  }
})();
createLogsIndex();

// const MONGO_URI = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}/?${process.env.MONGO_OPTIONS}`;

const MONGO_URI = 'mongodb://localhost:27017/logs'

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));
;



app.post("/log", async (req, res) => {
  console.log("HIT:", req.body);
  try {
    const incoming = req.body;
    const logs = Array.isArray(incoming) ? incoming : [incoming];

    logs.forEach((log) => {
      addLog(log);
      req.app.get("io").emit("new-log", log);
    });

    res.status(200).json({ status: "stored", count: logs.length });
  } catch (err) {
    console.error("Elasticsearch error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/logs", async (req, res) => {
  try {
    const {
      level,
      service,
      start,
      end,
      page = 1,
      limit = 100,
      search,
      ...rest
    } = req.query;
    const { type } = req.query;

if (type) {
  must.push({ term: { type } });
}
    const must = [];

    if (level) {
  must.push({ term: { level: level.toLowerCase() } });
}
    if (service) must.push({ term: { service } });

    if (search) {
      must.push({
        bool: {
          should: [
            {
              match_phrase_prefix: {
                message: { query: search },
              },
            },
            {
              wildcard: {
                service: {
                  value: `*${search.toLowerCase()}*`,
                  case_insensitive: true,
                },
              },
            },
            {
              wildcard: {
                level: {
                  value: `*${search.toLowerCase()}*`,
                  case_insensitive: true,
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    if (start || end) {
      const range = {};
      if (start) range.gte = start;
      if (end) range.lte = end;
      must.push({ range: { "@timestamp": range } });
    }

    const from = (parseInt(page) - 1) * parseInt(limit);

    const result = await client.search({
      index: process.env.ELASTICSEARCH_INDEX,
      from,
      size: parseInt(limit),
      sort: [{ "@timestamp": { order: "desc" } }],
      query: must.length > 0
        ? { bool: { must } }
        : { match_all: {} },
    });

    const logs = result.hits.hits.map((hit) => ({
      id: hit._id,
      ...hit._source,
    }));

    res.json(logs);
  } catch (err) {
    console.error("❌ Error fetching logs:", err);
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
