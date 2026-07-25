const mongoose = require("mongoose");

const ApiKeySchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    minlength: 2,
    maxlength: 120,
    default: "Default Key",
  },
  serviceName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
    index: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: false,
    index: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  keyHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    select: false,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  permissions: {
    type: [String],
    default: ["logs:write"],
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  revoked: {
    type: Boolean,
    default: false,
    index: true,
  },
  revokedAt: {
    type: Date,
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  lastUsedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
});

module.exports = mongoose.model("ApiKey", ApiKeySchema);