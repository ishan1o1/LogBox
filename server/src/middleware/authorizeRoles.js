const { AppError } = require("../utils/errors");

function authorizeRoles(...roles) {
  const allowedRoles = new Set(roles.map((role) => String(role).toUpperCase()));

  return function authorizeRolesMiddleware(req, res, next) {
    const actorRole = req.userRole || req.user?.role || req.service?.role;

    if (!actorRole || !allowedRoles.has(actorRole)) {
      next(new AppError(403, "You do not have permission to perform this action"));
      return;
    }

    next();
  };
}

module.exports = authorizeRoles;