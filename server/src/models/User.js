const mongoose = require("mongoose");

const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  DEVELOPER: "DEVELOPER",
  VIEWER: "VIEWER",
  SERVICE: "SERVICE",
});

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.VIEWER,
    index: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    index: true,
  },
  assignedProjects: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
  ],
  disabled: {
    type: Boolean,
    default: false,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
});


UserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    organization: this.organization ? (this.organization._id ? this.organization._id.toString() : this.organization.toString()) : null,
    assignedProjects: Array.isArray(this.assignedProjects)
      ? this.assignedProjects.map((p) => (p._id ? p._id.toString() : p.toString()))
      : [],
    disabled: this.disabled || false,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", UserSchema);
module.exports.ROLES = ROLES;