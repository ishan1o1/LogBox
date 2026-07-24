const mongoose = require("mongoose");

const ApiKeySchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
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
  permissions: {
    type: [String],
    default: ["logs:write"],
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
});

module.exports = mongoose.model("ApiKey", ApiKeySchema);