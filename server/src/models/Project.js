const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: "",
  },
  status: {
    type: String,
    enum: ["ACTIVE", "ARCHIVED"],
    default: "ACTIVE",
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
});

ProjectSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Project", ProjectSchema);
