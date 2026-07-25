const ApiKey = require("../models/ApiKey");
const { sha256, randomToken } = require("../utils/crypto");
const { AppError } = require("../utils/errors");

function serializeApiKey(apiKey) {
  const ownerObj =
    typeof apiKey.owner === "object" && apiKey.owner !== null && (apiKey.owner._id || apiKey.owner.name)
      ? {
          id: apiKey.owner._id ? apiKey.owner._id.toString() : apiKey.owner.id,
          name: apiKey.owner.name,
          email: apiKey.owner.email,
          role: apiKey.owner.role,
        }
      : null;

  return {
    id: apiKey._id.toString(),
    name: apiKey.name || apiKey.serviceName || "API Key",
    serviceName: apiKey.serviceName,
    project: apiKey.project ? (apiKey.project._id ? apiKey.project._id.toString() : apiKey.project.toString()) : null,
    organization: apiKey.organization ? (apiKey.organization._id ? apiKey.organization._id.toString() : apiKey.organization.toString()) : null,
    owner: ownerObj || (apiKey.owner ? (apiKey.owner._id ? apiKey.owner._id.toString() : apiKey.owner.toString()) : null),
    createdBy: apiKey.createdBy ? (apiKey.createdBy._id ? apiKey.createdBy._id.toString() : apiKey.createdBy.toString()) : null,
    permissions: apiKey.permissions,
    active: apiKey.active && !apiKey.revoked,
    revoked: apiKey.revoked || false,
    revokedAt: apiKey.revokedAt || null,
    lastUsedAt: apiKey.lastUsedAt || null,
    createdAt: apiKey.createdAt,
  };
}

async function createApiKey({ name, serviceName, owner, createdBy, project, organization, permissions }) {
  const rawKey = `lb_${randomToken(36)}`;
  const keyHash = sha256(rawKey);
  const apiKey = await ApiKey.create({
    name: name || `${serviceName} Key`,
    serviceName,
    keyHash,
    owner,
    createdBy: createdBy || owner,
    project,
    organization,
    permissions: permissions || ["logs:write"],
  });

  return {
    apiKey: rawKey,
    record: serializeApiKey(apiKey),
  };
}

async function verifyApiKey(rawKey) {
  if (!rawKey) {
    throw new AppError(401, "API key is required");
  }

  const apiKey = await ApiKey.findOne({
    keyHash: sha256(rawKey),
    active: true,
    revoked: { $ne: true },
  })
    .select("+keyHash")
    .populate("owner", "name email role")
    .populate("project", "name status organization")
    .populate("organization", "name");

  if (!apiKey) {
    throw new AppError(401, "Invalid or revoked API key");
  }

  if (apiKey.project && apiKey.project.status === "ARCHIVED") {
    throw new AppError(403, "Project is archived and cannot ingest logs");
  }

  if (!apiKey.permissions.includes("logs:write")) {
    throw new AppError(403, "API key is not allowed to write logs");
  }

  return apiKey;
}

module.exports = {
  createApiKey,
  verifyApiKey,
  serializeApiKey,
};