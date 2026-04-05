const client = require("../../config/elasticsearch");

const getGroupedIncidents = async (req, res) => {
  try {
    const result = await client.search({
      index: "logstash-*",
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { level: "error" } }
          ]
        }
      },
      aggs: {
        grouped_errors: {
          terms: {
            field: "fingerprint.keyword",
            size: 50,
            order: { _count: "desc" }
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
                    "@timestamp"
                  ]
                }
              }
            },
            first_seen: {
              min: { field: "@timestamp" }
            },
            last_seen: {
              max: { field: "@timestamp" }
            }
          }
        }
      }
    });

    const incidents = result.aggregations.grouped_errors.buckets.map((bucket) => {
      const log = bucket.latest_log.hits.hits[0]?._source || {};

      return {
        fingerprint: bucket.key,
        title: log.message || "Unknown error",
        count: bucket.doc_count,
        route: log.route || null,
        method: log.method || null,
        module: log.module || null,
        statusCode: log.statusCode || null,
        severity: "high",
        firstSeen: bucket.first_seen.value_as_string,
        lastSeen: bucket.last_seen.value_as_string
      };
    });

    res.json({
      success: true,
      total: incidents.length,
      incidents
    });
  } catch (error) {
    console.error("Error fetching grouped incidents:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grouped incidents"
    });
  }
};

module.exports = { getGroupedIncidents };