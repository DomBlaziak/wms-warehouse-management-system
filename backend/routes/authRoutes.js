const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
  loginRateLimiter,
  resetRequestRateLimiter,
} = require("../middlewares/rateLimitMiddleware");

// Trasy autoryzacji - logowanie, wylogowanie, zgłoszenie resetu hasła
router.post("/login", loginRateLimiter, authController.login);
router.post("/logout", authController.logout);
router.post("/reset-request", resetRequestRateLimiter, authController.resetRequest);

module.exports = router;
