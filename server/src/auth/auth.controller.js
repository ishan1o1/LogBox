const {
  registerUser,
  loginUser,
  refreshSession,
  logoutSession,
  serializeUser,
} = require("./auth.service");
const {
  requiredString,
  validateEmail,
  validatePassword,
} = require("../utils/validation");
const { AppError, asyncHandler } = require("../utils/errors");

const register = asyncHandler(async (req, res) => {
  const name = requiredString(req.body, "name", { min: 2, max: 120 });
  const email = validateEmail(req.body?.email);
  const password = validatePassword(req.body?.password);
  const organizationName = req.body?.organizationName || req.body?.orgName;

  const result = await registerUser({ name, email, password, organizationName });
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const email = validateEmail(req.body?.email);
  const password = requiredString(req.body, "password");

  const result = await loginUser({ email, password });
  res.json(result);
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = requiredString(req.body, "refreshToken");
  const result = await refreshSession(refreshToken);
  res.json(result);
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.body?.refreshToken;
  if (!refreshToken) {
    throw new AppError(400, "refreshToken is required");
  }

  await logoutSession(refreshToken);
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
};