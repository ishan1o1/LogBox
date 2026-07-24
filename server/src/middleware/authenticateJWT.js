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

    req.user = user;
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