const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_DAYS, 10) || 7;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me-access-secret";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}

module.exports = {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_DAYS,
  JWT_SECRET,
};