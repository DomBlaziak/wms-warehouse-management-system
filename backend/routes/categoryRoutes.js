const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const categoryController = require("../controllers/categoryController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../middlewares/authMiddleware");

// Zalogowani mogą pobrać listę kategorii
router.get("/", authenticateToken, productController.getCategories);

// Tylko Administrator może zmieniać kategorie i ich schematy.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("Administrator"),
  categoryController.createCategory,
);
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator"),
  categoryController.updateCategory,
);
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator"),
  categoryController.deleteCategory,
);

module.exports = router;
