const Project = require("../models/Project");
const { ROLES } = require("../models/User");
const { AppError } = require("../utils/errors");

/**
 * Middleware to authorize access to a specific Project.
 *
 * Enforces:
 * 1. Project exists and belongs to the authenticated user's Organization (`req.organizationId`).
 * 2. Non-ADMIN users must have the project ID listed in their `req.assignedProjects`.
 *
 * Never trusts frontend inputs for tenant context.
 *
 * @param {string} [paramName="id"] - Parameter name in req.params / req.body / req.query containing project ID
 */
function authorizeProject(paramName = "id") {
  return async function authorizeProjectMiddleware(req, res, next) {
    try {
      const projectId = req.params[paramName] || req.body[paramName] || req.query[paramName];

      if (!projectId) {
        throw new AppError(400, "Project ID is required");
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new AppError(404, "Project not found");
      }

      const userOrgId = req.organizationId || (req.user?.organization
        ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString())
        : null);

      if (!userOrgId || project.organization.toString() !== userOrgId) {
        throw new AppError(403, "Access denied: project belongs to another organization");
      }

      const role = req.userRole || req.user?.role;

      // Admins have full access to all projects in their organization
      if (role === ROLES.ADMIN) {
        req.project = project;
        return next();
      }

      // Non-Admin (Developer/Viewer) must be assigned to this project
      const assignedIds = req.assignedProjects || (Array.isArray(req.user?.assignedProjects)
        ? req.user.assignedProjects.map((p) => (p._id ? p._id.toString() : p.toString()))
        : []);

      if (!assignedIds.includes(project._id.toString())) {
        throw new AppError(403, "Access denied: you are not assigned to this project");
      }

      req.project = project;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = authorizeProject;
