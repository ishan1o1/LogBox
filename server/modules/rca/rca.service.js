const client = require("../../config/elasticsearch");

const buildExactFilter = (field, value) => ({
  bool: {
    should: [
      { term: { [`${field}.keyword`]: value } },
      { term: { [field]: value } },
    ],
    minimum_should_match: 1,
  },
});

const buildIncidentContext = async ({ fingerprint, from, to }) => {
  const filters = [
    buildExactFilter("fingerprint", fingerprint),
    {
      range: {
        "@timestamp": {
          gte: from,
          lte: to,
        },
      },
    },
  ];

  const result = await client.search({
    index: "demo-logs-*",
    size: 200,
    sort: [{ "@timestamp": "asc" }],
    query: {
      bool: {
        filter: filters,
      },
    },
    _source: [
      "@timestamp",
      "message",
      "route",
      "method",
      "statusCode",
      "module",
      "level",
      "fingerprint",
      "responseTime",
      "service",
      "error",
      "stack",
      "requestId",
      "traceId",
    ],
    aggs: {
      routes: {
        terms: {
          field: "route.keyword",
          size: 10,
        },
      },
      modules: {
        terms: {
          field: "module.keyword",
          size: 10,
        },
      },
      levels: {
        terms: {
          field: "level.keyword",
          size: 10,
        },
      },
      status_codes: {
        terms: {
          field: "statusCode",
          size: 10,
        },
      },
    },
  });

  const hits = result.hits.hits.map((hit) => hit._source);

  if (!hits.length) {
    throw new Error("No logs found for this fingerprint");
  }

  const firstLog = hits[0];
  const lastLog = hits[hits.length - 1];

  const sampleLogs = hits.slice(0, 15).map((log) => ({
    timestamp: log["@timestamp"],
    level: log.level,
    message: log.message,
    route: log.route || null,
    module: log.module || null,
    statusCode: log.statusCode || null,
    method: log.method || null,
  }));

  const timeline = hits.slice(0, 20).map((log) => {
    return `${log["@timestamp"]} - ${log.level?.toUpperCase() || "LOG"} - ${log.message}`;
  });

  const affectedRoutes =
    result.aggregations.routes?.buckets?.map((b) => ({
      route: b.key,
      count: b.doc_count,
    })) || [];

  const affectedModules =
    result.aggregations.modules?.buckets?.map((b) => ({
      module: b.key,
      count: b.doc_count,
    })) || [];

  const statusCodes =
    result.aggregations.status_codes?.buckets?.reduce((acc, item) => {
      acc[item.key] = item.doc_count;
      return acc;
    }, {}) || {};

  const levels =
    result.aggregations.levels?.buckets?.reduce((acc, item) => {
      acc[item.key] = item.doc_count;
      return acc;
    }, {}) || {};

  return {
    fingerprint,
    totalOccurrences: hits.length,
    firstSeen: firstLog["@timestamp"],
    lastSeen: lastLog["@timestamp"],
    primaryMessage: firstLog.message,
    suspectedService: firstLog.service || null,
    affectedRoutes,
    affectedModules,
    statusCodes,
    levels,
    sampleLogs,
    timeline,
  };
};

module.exports = { buildIncidentContext };