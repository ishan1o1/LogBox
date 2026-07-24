const { verifyApiKey, serializeApiKey } = require("../auth/apiKey.service");

async function authenticateApiKey(req, res, next) {
  try {
    const rawKey = req.get("x-api-key");
    const apiKey = await verifyApiKey(rawKey);

    req.service = {
      role: "SERVICE",
      id: apiKey._id.toString(),
      serviceName: apiKey.serviceName,
      owner: apiKey.owner,
      permissions: apiKey.permissions,
      key: serializeApiKey(apiKey),
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticateApiKey;