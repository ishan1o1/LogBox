const express = require("express");
const User = require("../models/User");
const { ROLES } = User;
const RefreshToken = require("../models/RefreshToken");
const ApiKey = require("../models/ApiKey");
const authenticateJWT = require("../middleware/authenticateJWT");
const authorizeRoles = require("../middleware/authorizeRoles");
const { AppError, asyncHandler } = require("../utils/errors");
const { validateRole } = require("../utils/validation");

const router = express.Router();

router.use(authenticateJWT, authorizeRoles(ROLES.ADMIN));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users: users.map((user) => user.toSafeJSON()) });
  })
);

router.patch(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const role = validateRole(req.body?.role);
    const user = await User.findById(req.params.id);

    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.role = role;
    await user.save();

    res.json({ user: user.toSafeJSON() });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user._id.toString() === req.params.id) {
      throw new AppError(400, "Admins cannot delete their own account");
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    await Promise.all([
      RefreshToken.deleteMany({ userId: user._id }),
      ApiKey.updateMany({ owner: user._id }, { $set: { active: false } }),
      user.deleteOne(),
    ]);

    res.status(204).send();
  })
);

module.exports = router;