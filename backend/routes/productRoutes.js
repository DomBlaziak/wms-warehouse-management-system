const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/authMiddleware");

// Lista produktów (dostępna dla zalogowanych)
router.get("/", authenticateToken, productController.getProducts);

// Tworzenie i Edycja produktów - TYLKO KIEROWNIK
router.post(
  "/",
  authenticateToken,
  authorizeRoles("Kierownik"),
  productController.createProduct,
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("Kierownik"),
  productController.updateProduct,
);

// Usuwanie produktów - TYLKO KIEROWNIK
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("Kierownik"),
  productController.deleteProduct,
);

module.exports = router;
