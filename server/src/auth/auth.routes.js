const express = require("express");
const authController = require("./auth.controller");
const authenticateJWT = require("../middleware/authenticateJWT");
const { authRateLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/register", authRateLimiter, authController.register);
router.post("/login", authRateLimiter, authController.login);
router.post("/refresh", authRateLimiter, authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticateJWT, authController.me);

module.exports = router;