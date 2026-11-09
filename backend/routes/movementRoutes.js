const express = require("express");
const router = express.Router();
const movementController = require("../controllers/movementController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/authMiddleware");

// Wszystkie operacje wymagają autoryzacji
router.use(authenticateToken);

// Pobieranie historii ruchów (Magazynier, Kierownik, Administrator)
router.get(
  "/",
  authorizeRoles("Magazynier", "Kierownik", "Administrator"),
  movementController.getMovements,
);

// Przyjęcie towaru [ + PZ ] (Magazynier, Kierownik)
router.post(
  "/in",
  authorizeRoles("Magazynier", "Kierownik"),
  movementController.createMovementIn,
);

// Wydanie towaru [ - WZ ] (Magazynier, Kierownik)
router.post(
  "/out",
  authorizeRoles("Magazynier", "Kierownik"),
  movementController.createMovementOut,
);

module.exports = router;
