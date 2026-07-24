const ApiKey = require("../models/ApiKey");
const { sha256, randomToken } = require("../utils/crypto");
const { AppError } = require("../utils/errors");

function serializeApiKey(apiKey) {
  return {
    id: apiKey._id.toString(),
    serviceName: apiKey.serviceName,
    owner: apiKey.owner,
    permissions: apiKey.permissions,
    active: apiKey.active,
    createdAt: apiKey.createdAt,
  };
}

async function createApiKey({ serviceName, owner, permissions }) {
  const rawKey = `lb_${randomToken(36)}`;
  const keyHash = sha256(rawKey);
  const apiKey = await ApiKey.create({ serviceName, keyHash, owner, permissions });

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
  })
    .select("+keyHash")
    .populate("owner", "name email role");

  if (!apiKey) {
    throw new AppError(401, "Invalid API key");
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