/**
 * redis.js — Redis client factory and shared stream key configuration.
 *
 * All Redis clients in LogBox are created here so connection settings
 * and stream key names stay consistent across the server and worker processes.
 */

"use strict";

const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/** Main log ingestion stream */
const LOG_QUEUE_KEY =
  process.env.REDIS_LOG_STREAM_KEY ||
  process.env.REDIS_LOG_QUEUE_KEY ||
  "logbox:logs:stream";

/** Dead Letter Queue stream — permanently failed logs */
const LOG_DLQ_KEY =
  process.env.DLQ_STREAM ||
  process.env.REDIS_LOG_DLQ_KEY ||
  `${LOG_QUEUE_KEY}:dlq`;

/** Retry Sorted Set — delayed retry scheduling (score = retryAfter timestamp ms) */
const RETRY_ZSET_KEY =
  process.env.RETRY_STREAM || "logs:retry";

/** Consumer group name shared by all worker instances */
const LOG_CONSUMER_GROUP =
  process.env.REDIS_LOG_CONSUMER_GROUP || "logbox-log-writers";

// WeakMap so we never accumulate pending connect promises across multiple calls
const connectPromises = new WeakMap();

/**
 * Create a named Redis client with automatic reconnect strategy.
 * Client is not connected until connectRedisClient() is called.
 *
 * @param {string} name - Label used in error/log messages (e.g. "api", "worker-consumer")
 */
function createRedisClient(name = "default") {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on("error", (error) => {
    console.error(`[Redis:${name}] error:`, error.message);
  });

  client.on("connect", () => {
    console.log(`[Redis:${name}] connecting`);
  });

  client.on("ready", () => {
    console.log(`[Redis:${name}] ready`);
  });

  client.on("end", () => {
    console.log(`[Redis:${name}] connection closed`);
  });

  return client;
}

/**
 * Connect a Redis client if not already open.
 * Deduplicates concurrent connect() calls using a WeakMap.
 *
 * @param {object} client - Redis client created by createRedisClient()
 * @returns {Promise<object>} - The connected client
 */
async function connectRedisClient(client) {
  if (client.isOpen) {
    return client;
  }

  if (!connectPromises.has(client)) {
    connectPromises.set(
      client,
      client.connect().catch((error) => {
        connectPromises.delete(client);
        throw error;
      })
    );
  }

  await connectPromises.get(client);
  return client;
}

/**
 * Gracefully close a Redis client.
 * Safe to call on an already-closed client.
 *
 * @param {object} client - Redis client
 */
async function closeRedisClient(client) {
  if (!client?.isOpen) {
    return;
  }
  await client.quit();
}

module.exports = {
  REDIS_URL,
  LOG_QUEUE_KEY,
  LOG_DLQ_KEY,
  RETRY_ZSET_KEY,
  LOG_CONSUMER_GROUP,
  createRedisClient,
  connectRedisClient,
  closeRedisClient,
};
