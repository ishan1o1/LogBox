const client = require("../config/elasticsearch");

const createLogsIndex = async () => {
  try {
    const exists = await client.indices.exists({ index: "logs" });

    if (!exists) {
      await client.indices.create({
        index: "logs",
        mappings: {
          properties: {
            timestamp: { type: "date" },
            level: { type: "keyword" },
            source: { type: "keyword" },
            service: { type: "keyword" },
            route: { type: "keyword" },
            method: { type: "keyword" },
            endpoint: { type: "keyword" },
            message: { type: "text" },
            statusCode: { type: "integer" },
            errorType: { type: "keyword" },
            traceId: { type: "keyword" },
            requestId: { type: "keyword" },
            deploymentId: { type: "keyword" },
            responseTime: { type: "integer" },
            environment: { type: "keyword" }
          }
        },
      });

      console.log("✅ Elasticsearch 'logs' index created");
    } else {
      console.log("ℹ️ Elasticsearch 'logs' index already exists");
    }
  } catch (error) {
    console.error("❌ Error creating Elasticsearch index:", error);
  }
};

module.exports = createLogsIndex;