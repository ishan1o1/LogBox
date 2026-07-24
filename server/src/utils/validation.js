const { AppError } = require("./errors");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(["ADMIN", "DEVELOPER", "VIEWER"]);
const VALID_API_KEY_PERMISSIONS = new Set(["logs:write"]);

function requiredString(body, field, options = {}) {
  const value = typeof body?.[field] === "string" ? body[field].trim() : "";
  if (!value) {
    throw new AppError(400, `${field} is required`);
  }
  if (options.min && value.length < options.min) {
    throw new AppError(400, `${field} must be at least ${options.min} characters`);
  }
  if (options.max && value.length > options.max) {
    throw new AppError(400, `${field} must be at most ${options.max} characters`);
  }
  return value;
}

function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new AppError(400, "A valid email is required");
  }
  return email;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 8) {
    throw new AppError(400, "password must be at least 8 characters");
  }
  if (password.length > 256) {
    throw new AppError(400, "password is too long");
  }
  return password;
}

function validateRole(value) {
  const role = String(value || "").trim().toUpperCase();
  if (!VALID_ROLES.has(role)) {
    throw new AppError(400, "role must be ADMIN, DEVELOPER, or VIEWER");
  }
  return role;
}

function validatePermissions(value) {
  if (value == null) {
    return ["logs:write"];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(400, "permissions must be a non-empty array");
  }

  const permissions = [...new Set(value.map((permission) => String(permission).trim()))];
  const invalidPermission = permissions.find(
    (permission) => !VALID_API_KEY_PERMISSIONS.has(permission)
  );
  if (invalidPermission) {
    throw new AppError(400, `unsupported permission: ${invalidPermission}`);
  }

  return permissions;
}

module.exports = {
  requiredString,
  validateEmail,
  validatePassword,
  validateRole,
  validatePermissions,
};