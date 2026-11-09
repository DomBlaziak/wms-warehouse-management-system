const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/authMiddleware");

router.use(authenticateToken);
router.use(authorizeRoles("Administrator"));

// Zarządzanie użytkownikami pozostaje dostępne wyłącznie dla Administratora.
router.get("/", userController.getAllUsers);
router.get("/roles", userController.getRoles);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;
