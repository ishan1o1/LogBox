const rateLimit = require("express-rate-limit");

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT, 10) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number.parseInt(process.env.API_RATE_LIMIT, 10) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down" },
});

const logIngestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number.parseInt(process.env.LOG_INGEST_RATE_LIMIT, 10) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Log ingestion rate limit exceeded" },
});

module.exports = {
  authRateLimiter,
  apiRateLimiter,
  logIngestRateLimiter,
};