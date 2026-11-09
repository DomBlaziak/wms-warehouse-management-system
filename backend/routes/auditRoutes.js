const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/authMiddleware");

// Każda rola widzi tylko zakres audytu odpowiedni dla swoich obowiązków.
router.get(
  "/",
  authenticateToken,
  authorizeRoles("Magazynier", "Kierownik", "Administrator"),
  auditController.getAuditLogs,
);

module.exports = router;
