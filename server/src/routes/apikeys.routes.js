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
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const serviceName = requiredString(req.body, "serviceName", { min: 2, max: 120 });
    const permissions = validatePermissions(req.body?.permissions);
    const orgId = req.organizationId || (req.user?.organization ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString()) : null);

    const result = await createApiKey({
      serviceName,
      permissions,
      owner: req.user._id,
      organization: orgId,
      project: req.body?.projectId || undefined,
    });

    res.status(201).json({
      success: true,
      apiKey: result.apiKey,
      record: result.record,
      ...result.record,
      message: "Store this API key now. It will not be shown again.",
    });
  })
);

router.get(
  "/",
  authorizeRoles(ROLES.ADMIN, ROLES.DEVELOPER),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId || (req.user?.organization ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString()) : null);
    const query = { organization: orgId };
    if (req.user.role !== ROLES.ADMIN) {
      query.owner = req.user._id;
    }

    const apiKeys = await ApiKey.find(query)
      .sort({ createdAt: -1 })
      .populate("owner", "name email role")
      .populate("project", "name");

    res.json({ apiKeys: apiKeys.map(serializeApiKey) });
  })
);

// Revoke API Key
router.patch(
  "/:id/revoke",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId || (req.user?.organization ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString()) : null);
    const apiKey = await ApiKey.findOne({ _id: req.params.id, organization: orgId });
    if (!apiKey) {
      throw new AppError(404, "API key not found");
    }

    apiKey.active = false;
    apiKey.revoked = true;
    apiKey.revokedAt = new Date();
    apiKey.revokedBy = req.user._id;
    await apiKey.save();

    await apiKey.populate("owner", "name email role");

    res.json({ success: true, apiKey: serializeApiKey(apiKey) });
  })
);

// Reactivate API Key
router.patch(
  "/:id/reactivate",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId || (req.user?.organization ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString()) : null);
    const apiKey = await ApiKey.findOne({ _id: req.params.id, organization: orgId });
    if (!apiKey) {
      throw new AppError(404, "API key not found");
    }

    apiKey.active = true;
    apiKey.revoked = false;
    apiKey.revokedAt = null;
    apiKey.revokedBy = null;
    await apiKey.save();

    await apiKey.populate("owner", "name email role");

    res.json({ success: true, apiKey: serializeApiKey(apiKey) });
  })
);

// Delete API Key
router.delete(
  "/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = req.organizationId || (req.user?.organization ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString()) : null);
    const apiKey = await ApiKey.findOne({ _id: req.params.id, organization: orgId });
    if (!apiKey) {
      throw new AppError(404, "API key not found");
    }

    await apiKey.deleteOne();

    res.status(204).send();
  })
);

module.exports = router;