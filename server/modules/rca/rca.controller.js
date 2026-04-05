const client = require("../../config/elasticsearch");

const shouldRetryWithPlainFingerprint = (error) => {
  const message = [
    error?.message,
    error?.meta?.body?.error?.reason,
    ...(error?.meta?.body?.error?.root_cause || []).map((item) => item?.reason),
    JSON.stringify(error?.meta?.body?.error || {}),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    message.includes("fingerprint.keyword") ||
    message.includes("Fielddata is disabled on text fields") ||
    message.includes("Text fields are not optimised") ||
    message.includes("No mapping found for [fingerprint.keyword]")
  );
};

const buildExactFilter = (field, value) => ({
  bool: {
    should: [
      { term: { [`${field}.keyword`]: value } },
      { term: { [field]: value } },
    ],
    minimum_should_match: 1,
  },
});

const searchGroupedIncidents = async ({ filters, fingerprintField }) =>
  client.search({
    index: "demo-logs-*",
    size: 0,
    query: {
      bool: {
        filter: filters,
      },
    },
    aggs: {
      grouped_errors: {
        terms: {
          field: fingerprintField,
          size: 50,
          order: { _count: "desc" },
        },
        aggs: {
          latest_log: {
            top_hits: {
              size: 1,
              sort: [{ "@timestamp": { order: "desc" } }],
              _source: {
                includes: [
                  "message",
                  "route",
                  "method",
                  "statusCode",
                  "module",
                  "level",
                  "fingerprint",
                  "@timestamp",
                ],
              },
            },
          },
          first_seen: {
            min: { field: "@timestamp" },
          },
          last_seen: {
            max: { field: "@timestamp" },
          },
        },
      },
    },
  });

const getGroupedIncidents = async (req, res) => {
  try {
    const { level, route, module, from, to } = req.query;

const filters = [];

if (level) {
  filters.push({ term: { level: String(level).toLowerCase() } });
}

    if (route) filters.push(buildExactFilter("route", route));
    if (module) filters.push(buildExactFilter("module", module));

    if (from || to) {
      filters.push({
        range: {
          "@timestamp": {
            gte: from || "now-24h",
            lte: to || "now",
          },
        },
      });
    }

    let result;

    try {
      result = await searchGroupedIncidents({
        filters,
        fingerprintField: "fingerprint.keyword",
      });
    } catch (error) {
      if (!shouldRetryWithPlainFingerprint(error)) {
        throw error;
      }

      result = await searchGroupedIncidents({
        filters,
        fingerprintField: "fingerprint",
      });
    }

    const incidents = result.aggregations.grouped_errors.buckets.map((bucket) => {
      const log = bucket.latest_log.hits.hits[0]?._source || {};
      const levelValue = String(log.level || level || "error").toLowerCase();
      const severity =
        levelValue === "fatal" || levelValue === "critical" ? "critical" :
        levelValue === "warn" || levelValue === "warning" ? "medium" :
        "high";

      return {
        fingerprint: bucket.key,
        title: log.message || "Unknown error",
        count: bucket.doc_count,
        route: log.route || null,
        method: log.method || null,
        module: log.module || null,
        statusCode: log.statusCode || null,
        severity,
        firstSeen: bucket.first_seen.value_as_string,
        lastSeen: bucket.last_seen.value_as_string,
      };
    });

    res.json({
      success: true,
      total: incidents.length,
      incidents,
    });
  } catch (error) {
    console.error("Error fetching grouped incidents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grouped incidents",
    });
  }
};

module.exports = { getGroupedIncidents };
