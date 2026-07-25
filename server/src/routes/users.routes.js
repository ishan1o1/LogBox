const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Project = require("../models/Project");
const RefreshToken = require("../models/RefreshToken");
const ApiKey = require("../models/ApiKey");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRoles = require("../middleware/authorizeRoles");
const { AppError, asyncHandler } = require("../utils/errors");
const { validateRole, validateEmail, validatePassword, requiredString } = require("../utils/validation");
const { ROLES } = User;

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

const router = express.Router();

router.use(authenticateJWT, authorizeRoles(ROLES.ADMIN));

function getOrgId(req) {
  const org = req.user?.organization;
  return org ? (org._id ? org._id.toString() : org.toString()) : null;
}

// ─── GET /users — List Users in Organization ──────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const users = await User.find({ organization: orgId })
      .sort({ createdAt: -1 })
      .populate("assignedProjects", "name description status");

    res.json({ users: users.map((user) => user.toSafeJSON()) });
  })
);

// ─── POST /users — Admin Adds / Invites User to Organization ──────────────────────
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const email = validateEmail(req.body?.email);
    const role = validateRole(req.body?.role || ROLES.VIEWER);

    let assignedProjects = [];
    if (Array.isArray(req.body?.assignedProjects) && req.body.assignedProjects.length > 0) {
      const validProjects = await Project.find({
        _id: { $in: req.body.assignedProjects },
        organization: orgId,
      });

      if (validProjects.length !== req.body.assignedProjects.length) {
        throw new AppError(400, "One or more assigned projects are invalid or belong to another organization");
      }
      assignedProjects = validProjects.map((p) => p._id);
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // Check if user is already in this organization
      const existingOrgId = existingUser.organization
        ? (existingUser.organization._id ? existingUser.organization._id.toString() : existingUser.organization.toString())
        : null;

      if (existingOrgId === orgId) {
        throw new AppError(400, "User is already a member of this organization");
      }

      // Re-assign user to this organization with selected role
      existingUser.organization = orgId;
      existingUser.role = role;
      if (assignedProjects.length > 0) {
        existingUser.assignedProjects = assignedProjects;
      }
      if (req.body?.name && req.body.name.trim()) {
        existingUser.name = req.body.name.trim();
      }

      await existingUser.save();
      res.status(200).json({ user: existingUser.toSafeJSON(), message: "User added to organization successfully" });
      return;
    }

    // New User Creation
    const name = requiredString(req.body, "name", { min: 2, max: 120 });
    const rawPassword = req.body?.password ? validatePassword(req.body.password) : crypto.randomBytes(12).toString("hex");
    const passwordHash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

    const newUser = await User.create({
      name,
      email,
      passwordHash,
      role,
      organization: orgId,
      assignedProjects,
    });

    res.status(201).json({ user: newUser.toSafeJSON(), message: "User created and added to organization successfully" });
  })
);

// ─── PATCH /users/:id/role — Change Role ──────────────────────────────────────
router.patch(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const role = validateRole(req.body?.role);

    if (req.user._id.toString() === req.params.id && role !== ROLES.ADMIN) {
      throw new AppError(400, "Admins cannot demote their own account");
    }

    const user = await User.findOne({ _id: req.params.id, organization: orgId });

    if (!user) {
      throw new AppError(404, "User not found in your organization");
    }

    // Prevent demoting the last ADMIN
    if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
      const adminCount = await User.countDocuments({ organization: orgId, role: ROLES.ADMIN });
      if (adminCount <= 1) {
        throw new AppError(400, "Cannot demote the last ADMIN of an organization");
      }
    }

    user.role = role;
    await user.save();

    res.json({ user: user.toSafeJSON() });
  })
);

// ─── PATCH /users/:id/projects — Assign Projects ─────────────────────────────
router.patch(
  "/:id/projects",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const user = await User.findOne({ _id: req.params.id, organization: orgId });

    if (!user) {
      throw new AppError(404, "User not found in your organization");
    }

    const projectIds = Array.isArray(req.body?.assignedProjects) ? req.body.assignedProjects : [];
    if (projectIds.length > 0) {
      const validProjects = await Project.find({
        _id: { $in: projectIds },
        organization: orgId,
      });

      if (validProjects.length !== projectIds.length) {
        throw new AppError(400, "One or more assigned projects are invalid or belong to another organization");
      }
      user.assignedProjects = validProjects.map((p) => p._id);
    } else {
      user.assignedProjects = [];
    }

    await user.save();

    res.json({ user: user.toSafeJSON() });
  })
);

// ─── PATCH /users/:id/status — Enable / Disable User ─────────────────────────
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    if (req.user._id.toString() === req.params.id) {
      throw new AppError(400, "Admins cannot disable their own account");
    }

    const user = await User.findOne({ _id: req.params.id, organization: orgId });
    if (!user) {
      throw new AppError(404, "User not found in your organization");
    }

    user.disabled = Boolean(req.body?.disabled);
    await user.save();

    // Revoke refresh tokens if disabled
    if (user.disabled) {
      await RefreshToken.updateMany({ userId: user._id }, { $set: { revoked: true } });
    }

    res.json({ user: user.toSafeJSON() });
  })
);

// ─── POST /users/:id/reset-password — Reset User Password ────────────────────
router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    const newPassword = validatePassword(req.body?.newPassword);
    const user = await User.findOne({ _id: req.params.id, organization: orgId });

    if (!user) {
      throw new AppError(404, "User not found in your organization");
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    // Revoke existing sessions so user must log in with new password
    await RefreshToken.updateMany({ userId: user._id }, { $set: { revoked: true } });

    res.json({ message: "Password updated successfully" });
  })
);

// ─── DELETE /users/:id — Remove User from Organization ────────────────────────
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = getOrgId(req);
    if (req.user._id.toString() === req.params.id) {
      throw new AppError(400, "Admins cannot delete their own account");
    }

    const user = await User.findOne({ _id: req.params.id, organization: orgId });
    if (!user) {
      throw new AppError(404, "User not found in your organization");
    }

    // Prevent deleting the last ADMIN
    if (user.role === ROLES.ADMIN) {
      const adminCount = await User.countDocuments({ organization: orgId, role: ROLES.ADMIN });
      if (adminCount <= 1) {
        throw new AppError(400, "Cannot remove the last ADMIN of an organization");
      }
    }

    await Promise.all([
      RefreshToken.deleteMany({ userId: user._id }),
      ApiKey.updateMany({ owner: user._id }, { $set: { active: false, revoked: true } }),
      user.deleteOne(),
    ]);

    res.status(204).send();
  })
);

module.exports = router;