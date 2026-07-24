const express = require("express");
const ApiKey = require("../models/ApiKey");
const { createApiKey, serializeApiKey } = require("../auth/apiKey.service");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRoles = require("../middleware/authorizeRoles");
const { AppError, asyncHandler } = require("../utils/errors");
const { requiredString, validatePermissions } = require("../utils/validation");
const { ROLES } = require("../models/User");

const router = express.Router();

router.use(authenticateJWT);

router.post(
  "/",
  authorizeRoles(ROLES.ADMIN, ROLES.DEVELOPER),
  asyncHandler(async (req, res) => {
    const serviceName = requiredString(req.body, "serviceName", { min: 2, max: 120 });
    const permissions = validatePermissions(req.body?.permissions);

    const result = await createApiKey({
      serviceName,
      permissions,
      owner: req.user._id,
    });

    res.status(201).json({
      ...result.record,
      apiKey: result.apiKey,
      message: "Store this API key now. It will not be shown again.",
    });
  })
);

router.get(
  "/",
  authorizeRoles(ROLES.ADMIN, ROLES.DEVELOPER),
  asyncHandler(async (req, res) => {
    const query = req.user.role === ROLES.ADMIN ? {} : { owner: req.user._id };
    const apiKeys = await ApiKey.find(query)
      .sort({ createdAt: -1 })
      .populate("owner", "name email role");

    res.json({ apiKeys: apiKeys.map(serializeApiKey) });
  })
);

router.delete(
  "/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const apiKey = await ApiKey.findById(req.params.id);
    if (!apiKey) {
      throw new AppError(404, "API key not found");
    }

    apiKey.active = false;
    await apiKey.save();

    res.status(204).send();
  })
);

module.exports = router;