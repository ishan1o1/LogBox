const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_TTL, JWT_SECRET } = require("../config/auth");

function signAccessToken(user) {
  const orgId = user.organization
    ? (user.organization._id ? user.organization._id.toString() : user.organization.toString())
    : null;

  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      organizationId: orgId,
      type: "access",
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};