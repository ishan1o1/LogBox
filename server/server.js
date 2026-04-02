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

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});
app.set("io",io);

app.use(cors());
app.use(express.json());
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
      page  = 1,
      limit = 100,
      search,
      ...rest              // all other params, including meta.* keys
    } = req.query;

    const must = [];

    /* ── Top-level exact filters ── */
    if (level)   must.push({ term: { level: level.toUpperCase() } });
    if (service) must.push({ term: { service } });

    /* ── Free-text message search ── */
    if (search) {
      must.push({
        multi_match: {
          query:  search,
          fields: ["message", "service"],
          type:   "phrase_prefix",
        },
      });
    }

    /* ── Time range ── */
    if (start || end) {
      const range = {};
      if (start) range.gte = start;
      if (end)   range.lte = end;
      must.push({ range: { timestamp: range } });
    }

    /* ── Dynamic meta.* filters ──────────────────────────────────────────
       Any query param of the form  meta.<key>=<value>
       maps to an ES query against the stored  meta.<key>  field.

       We try to be smart about the actual field name stored in ES (camelCase)
       so we canonicalize common aliases:
         method     → meta.method        (exact keyword)
         route      → meta.route         (exact keyword)
         statuscode → meta.statusCode    (numeric/keyword)
         status     → meta.statusCode
         requestid  → meta.requestId     (keyword)
         traceid    → meta.traceId       (keyword)
         deploymentid→meta.deploymentId  (keyword)
         responsetime→meta.responseTime  (numeric)
         host       → meta.host          (keyword)
    ──────────────────────────────────────────────────────────────────── */
    const META_FIELD_MAP = {
      method:        "meta.method",
      route:         "meta.route",
      statuscode:    "meta.statusCode",
      status:        "meta.statusCode",
      requestid:     "meta.requestId",
      traceid:       "meta.traceId",
      deploymentid:  "meta.deploymentId",
      responsetime:  "meta.responseTime",
      host:          "meta.host",
    };

    for (const [param, value] of Object.entries(rest)) {
      if (!param.startsWith("meta.") || !value) continue;
      const rawKey = param.slice(5).toLowerCase();            // strip "meta."
      const esField = META_FIELD_MAP[rawKey]
        ?? `meta.${param.slice(5)}`;                          // passthrough

      // Numeric fields → range (supports plain value or ">=200" style)
      const numericFields = new Set(["meta.statusCode", "meta.responseTime"]);
      if (numericFields.has(esField)) {
        const num = Number(value);
        if (!isNaN(num)) {
          must.push({ term: { [esField]: num } });
        }
      } else {
        // String fields — use wildcard for partial matching (e.g. route:/api)
        must.push({
          wildcard: {
            [esField]: {
              value:            `*${value.toLowerCase()}*`,
              case_insensitive: true,
            },
          },
        });
      }
    }

    /* ── Execute ── */
    const from = (parseInt(page) - 1) * parseInt(limit);
    const result = await client.search({
      index: "logs",
      from,
      size:  parseInt(limit),
      sort:  [{ timestamp: { order: "desc" } }],
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
