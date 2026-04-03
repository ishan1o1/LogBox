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

    /* ── Free-text search ──────────────────────────────────────────────────
       'message' is a text field   → phrase_prefix is fine
       'service' is a keyword field → use wildcard instead
       We combine them in a should so either match counts.
    ──────────────────────────────────────────────────────────────────────── */
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
                  value:            `*${search.toLowerCase()}*`,
                  case_insensitive: true,
                },
              },
            },
            {
              wildcard: {
                level: {
                  value:            `*${search.toUpperCase()}*`,
                  case_insensitive: true,
                },
              },
            },
          ],
          minimum_should_match: 1,
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

    /* ── key:value filters ────────────────────────────────────────────────
       The frontend sends tokens like  statuscode:200  as  meta.statuscode=200.
       All searchable fields are stored at the TOP LEVEL in Elasticsearch
       (not under a meta sub-object). This map resolves lowercase aliases to
       the correct camelCase ES field name.

         statuscode / status  → statusCode   (integer)
         responsetime         → responseTime (integer)
         method               → method       (keyword)
         route                → route        (keyword)
         endpoint             → endpoint     (keyword)
         requestid            → requestId    (keyword)
         traceid              → traceId      (keyword)
         deploymentid         → deploymentId (keyword)
         errortype            → errorType    (keyword)
         environment          → environment  (keyword)
         source               → source       (keyword)
         host                 → host         (keyword)  ← if stored
    ──────────────────────────────────────────────────────────────────── */
    const FIELD_MAP = {
      // numeric
      statuscode:    { field: "statusCode",   numeric: true  },
      status:        { field: "statusCode",   numeric: true  },
      responsetime:  { field: "responseTime", numeric: true  },
      // keyword
      method:        { field: "method",       numeric: false },
      route:         { field: "route",        numeric: false },
      endpoint:      { field: "endpoint",     numeric: false },
      requestid:     { field: "requestId",    numeric: false },
      traceid:       { field: "traceId",      numeric: false },
      deploymentid:  { field: "deploymentId", numeric: false },
      errortype:     { field: "errorType",    numeric: false },
      environment:   { field: "environment",  numeric: false },
      source:        { field: "source",       numeric: false },
      host:          { field: "host",         numeric: false },
    };

    for (const [param, value] of Object.entries(rest)) {
      if (!param.startsWith("meta.") || !value) continue;
      const rawKey = param.slice(5).toLowerCase();   // strip "meta." prefix
      const mapping = FIELD_MAP[rawKey];

      if (mapping) {
        if (mapping.numeric) {
          const num = Number(value);
          if (!isNaN(num)) {
            must.push({ term: { [mapping.field]: num } });
          }
        } else {
          // keyword — wildcard for partial/case-insensitive match
          must.push({
            wildcard: {
              [mapping.field]: {
                value:            `*${value.toLowerCase()}*`,
                case_insensitive: true,
              },
            },
          });
        }
      } else {
        // Unknown key — pass through as-is (best-effort wildcard)
        const esField = param.slice(5); // strip "meta." but keep original casing
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
