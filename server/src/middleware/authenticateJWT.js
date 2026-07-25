const User = require("../models/User");
const { verifyAccessToken } = require("../auth/jwt.service");
const { AppError } = require("../utils/errors");

async function authenticateJWT(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new AppError(401, "Bearer access token is required");
    }

    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      throw new AppError(401, "Invalid access token");
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw new AppError(401, "User no longer exists");
    }

    if (user.disabled) {
      throw new AppError(403, "Account is disabled. Contact your administrator.");
    }

    const organizationId = user.organization
      ? (user.organization._id ? user.organization._id.toString() : user.organization.toString())
      : (payload.organizationId || null);

    const assignedProjects = Array.isArray(user.assignedProjects)
      ? user.assignedProjects.map((p) => (p._id ? p._id.toString() : p.toString()))
      : [];

    req.user = user;
    req.organizationId = organizationId;
    req.userRole = user.role;
    req.assignedProjects = assignedProjects;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next(new AppError(401, "Invalid or expired access token"));
      return;
    }
    next(error);
  }
}

module.exports = authenticateJWT;