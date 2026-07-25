const express = require("express");
const Project = require("../models/Project");
const ApiKey = require("../models/ApiKey");
const { createApiKey, serializeApiKey } = require("../auth/apiKey.service");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRoles = require("../middleware/authorizeRoles");
const { AppError, asyncHandler } = require("../utils/errors");
const { requiredString } = require("../utils/validation");
const { ROLES } = require("../models/User");

const router = express.Router();

router.use(authenticateJWT);

function getOrgId(req) {
  const org = req.user?.organization;
  return org ? (org._id ? org._id.toString() : org.toString()) : null;
}

// ─── POST /projects — Create Project (Admin only) ─────────────────────────────
router.post(
  "/",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      throw new AppError(400, "User does not belong to an organization");
    }

    const name = requiredString(req.body, "name", { min: 2, max: 120 });
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const keyName = typeof req.body?.keyName === "string" && req.body.keyName.trim() ? req.body.keyName.trim() : `${name} Production Key`;

    const existing = await Project.findOne({ organization: orgId, name });
    if (existing) {
      throw new AppError(409, "A project with this name already exists in your organization");
    }

    const project = await Project.create({
      name,
      description,
      organization: orgId,
      status: "ACTIVE",
    });

    const apiKeyResult = await createApiKey({
      name: keyName,
      serviceName: name,
      owner: req.user._id,
      createdBy: req.user._id,
      project: project._id,
      organization: orgId,
      permissions: ["logs:write"],
    });

    res.status(201).json({
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        organization: project.organization.toString(),
        status: project.status,
        createdAt: project.createdAt,
      },
      apiKey: apiKeyResult.apiKey,
      apiKeyRecord: apiKeyResult.record,
      message: "Project created and API key generated. Store the API key now as it will not be shown again.",
    });
  })
);

// ─── GET /projects — List Projects for Organization with Statistics ──────────
router.get(
  "/",
  authorizeRoles(ROLES.ADMIN, ROLES.DEVELOPER, ROLES.VIEWER),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    if (!orgId) {
      throw new AppError(400, "User does not belong to an organization");
    }

    let query = { organization: orgId };
    if (req.query.status) {
      query.status = String(req.query.status).toUpperCase();
    }

    if (req.user.role !== ROLES.ADMIN && Array.isArray(req.user.assignedProjects) && req.user.assignedProjects.length > 0) {
      query._id = { $in: req.user.assignedProjects };
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });
    const projectIds = projects.map((p) => p._id);

    // Aggregate active keys count per project
    const keyCounts = await ApiKey.aggregate([
      { $match: { project: { $in: projectIds }, active: true, revoked: false } },
      { $group: { _id: "$project", count: { $sum: 1 } } },
    ]);

    const keyCountMap = new Map(keyCounts.map((k) => [k._id.toString(), k.count]));

    res.json({
      projects: projects.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        description: p.description,
        organization: p.organization.toString(),
        status: p.status,
        activeKeysCount: keyCountMap.get(p._id.toString()) || 0,
        createdAt: p.createdAt,
      })),
    });
  })
);

// ─── GET /projects/:id — Single Project Details ───────────────────────────────
router.get(
  "/:id",
  authorizeRoles(ROLES.ADMIN, ROLES.DEVELOPER, ROLES.VIEWER),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const project = await Project.findById(req.params.id);

    if (!project || project.organization.toString() !== orgId) {
      throw new AppError(404, "Project not found");
    }

    const apiKeys = await ApiKey.find({ project: project._id, active: true, revoked: false }).sort({ createdAt: -1 });

    res.json({
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        organization: project.organization.toString(),
        status: project.status,
        createdAt: project.createdAt,
      },
      apiKeys: apiKeys.map(serializeApiKey),
    });
  })
);

// ─── PATCH /projects/:id — Edit Project (Admin only) ──────────────────────────
router.patch(
  "/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const project = await Project.findById(req.params.id);

    if (!project || project.organization.toString() !== orgId) {
      throw new AppError(404, "Project not found");
    }

    if (req.body?.name) {
      project.name = requiredString(req.body, "name", { min: 2, max: 120 });
    }
    if (req.body?.description !== undefined) {
      project.description = String(req.body.description).trim();
    }
    if (req.body?.status && ["ACTIVE", "ARCHIVED"].includes(String(req.body.status).toUpperCase())) {
      project.status = String(req.body.status).toUpperCase();
    }

    await project.save();

    res.json({
      project: {
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        organization: project.organization.toString(),
        status: project.status,
        createdAt: project.createdAt,
      },
    });
  })
);

// ─── PATCH /projects/:id/archive — Archive Project (Admin only) ──────────────
router.patch(
  "/:id/archive",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const project = await Project.findById(req.params.id);

    if (!project || project.organization.toString() !== orgId) {
      throw new AppError(404, "Project not found");
    }

    project.status = "ARCHIVED";
    await project.save();

    // Soft revoke associated API keys for this project
    await ApiKey.updateMany(
      { project: project._id, revoked: false },
      {
        $set: {
          active: false,
          revoked: true,
          revokedAt: new Date(),
          revokedBy: req.user._id,
        },
      }
    );

    res.json({
      message: "Project archived successfully",
      project: {
        id: project._id.toString(),
        name: project.name,
        status: project.status,
      },
    });
  })
);

// ─── DELETE /projects/:id — Soft Archive (Admin only) ──────────────────────────
router.delete(
  "/:id",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const project = await Project.findById(req.params.id);

    if (!project || project.organization.toString() !== orgId) {
      throw new AppError(404, "Project not found");
    }

    // Soft archive project instead of hard deletion
    project.status = "ARCHIVED";
    await project.save();

    await ApiKey.updateMany(
      { project: project._id, revoked: false },
      {
        $set: {
          active: false,
          revoked: true,
          revokedAt: new Date(),
          revokedBy: req.user._id,
        },
      }
    );

    res.json({ message: "Project archived successfully" });
  })
);

// ─── POST /projects/:id/regenerate-key — Regenerate API Key (Admin only) ──────
router.post(
  "/:id/regenerate-key",
  authorizeRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const project = await Project.findById(req.params.id);

    if (!project || project.organization.toString() !== orgId) {
      throw new AppError(404, "Project not found");
    }

    if (project.status === "ARCHIVED") {
      throw new AppError(400, "Cannot generate API key for an archived project");
    }

    const keyName = typeof req.body?.keyName === "string" && req.body.keyName.trim()
      ? req.body.keyName.trim()
      : `${project.name} Key (${new Date().toLocaleDateString()})`;

    // Soft revoke active API keys for this project
    await ApiKey.updateMany(
      { project: project._id, revoked: false },
      {
        $set: {
          active: false,
          revoked: true,
          revokedAt: new Date(),
          revokedBy: req.user._id,
        },
      }
    );

    // Generate new key hashed in DB
    const result = await createApiKey({
      name: keyName,
      serviceName: project.name,
      owner: req.user._id,
      createdBy: req.user._id,
      project: project._id,
      organization: orgId,
      permissions: ["logs:write"],
    });

    res.status(201).json({
      apiKey: result.apiKey,
      record: result.record,
      message: "New API key generated. Store it now as it will not be shown again.",
    });
  })
);

module.exports = router;
