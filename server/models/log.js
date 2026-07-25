const mongoose = require("mongoose");

const LogSchema = new mongoose.Schema({
  service: {
    type: String,
    required: true,
    trim: true,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    index: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    index: true,
  },
  projectName: {
    type: String,
    trim: true,
  },
  level: {
    type: String,
    enum: ["INFO", "WARN", "ERROR", "DEBUG"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 604800, // 7 days TTL
  },
  meta: {
    type: Object,
    default: {},
  },
});

// Indexes (IMPORTANT for multi-tenant query performance)
LogSchema.index({ organizationId: 1, projectId: 1, timestamp: -1 });
LogSchema.index({ level: 1, service: 1 });
LogSchema.index({ timestamp: -1 });
LogSchema.index({ message: "text" });

module.exports = mongoose.model("Log", LogSchema);