const bcrypt = require("bcrypt");
const User = require("../models/User");
const { ROLES } = User;
const RefreshToken = require("../models/RefreshToken");
const { REFRESH_TOKEN_DAYS } = require("../config/auth");
const { sha256, randomToken } = require("../utils/crypto");
const { AppError } = require("../utils/errors");
const { signAccessToken } = require("./jwt.service");

const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const REFRESH_TOKEN_MS = REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

function serializeUser(user) {
  return typeof user.toSafeJSON === "function"
    ? user.toSafeJSON()
    : {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      };
}

async function issueTokenPair(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = randomToken(64);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MS);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
}

async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError(409, "Email is already registered");
  }

  const userCount = await User.estimatedDocumentCount();
  const role = userCount === 0 ? ROLES.ADMIN : ROLES.VIEWER;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash, role });
  const tokens = await issueTokenPair(user);

  return { user: serializeUser(user), ...tokens };
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    throw new AppError(401, "Invalid email or password");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new AppError(401, "Invalid email or password");
  }

  const tokens = await issueTokenPair(user);
  return { user: serializeUser(user), ...tokens };
}

async function refreshSession(refreshToken) {
  const tokenHash = sha256(refreshToken || "");
  const storedToken = await RefreshToken.findOne({
    tokenHash,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });

  if (!storedToken) {
    throw new AppError(401, "Invalid refresh token");
  }

  const user = await User.findById(storedToken.userId);
  if (!user) {
    storedToken.revoked = true;
    await storedToken.save();
    throw new AppError(401, "Invalid refresh token");
  }

  storedToken.revoked = true;
  await storedToken.save();

  const tokens = await issueTokenPair(user);
  return { user: serializeUser(user), ...tokens };
}

async function logoutSession(refreshToken) {
  if (!refreshToken) {
    return;
  }

  await RefreshToken.updateOne(
    { tokenHash: sha256(refreshToken), revoked: false },
    { $set: { revoked: true } }
  );
}

module.exports = {
  registerUser,
  loginUser,
  refreshSession,
  logoutSession,
  serializeUser,
};