const { AppError } = require("../utils/errors");

function notFound(req, res, next) {
  next(new AppError(404, "Route not found"));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
  });
}

module.exports = {
  notFound,
  errorHandler,
};