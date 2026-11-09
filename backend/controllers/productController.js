const db = require("../config/db");
const { logAudit } = require("../services/auditService");

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeAttributes = (value) => {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};

const parseInteger = (value, { min = 0, fallback = null } = {}) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (!/^(0|[1-9]\d*)$/.test(String(normalizedValue))) {
    return null;
  }
  const parsed = Number(normalizedValue);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : null;
};

const parsePrice = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalizedValue =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const isValidAttributes = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseProductInput = (body = {}) => ({
  categoryId: parseInteger(body.categoryId, { min: 1 }),
  name: normalizeText(body.name),
  productCode: normalizeText(body.productCode),
  purchasePrice: parsePrice(body.purchasePrice ?? body.price, 0), // Wsteczna kompatybilność dla starego pola price
  sellingPrice: parsePrice(body.sellingPrice, 0),
  attributes: normalizeAttributes(body.attributes),
});

const categoryExists = async (executor, categoryId) => {
  const { rows } = await executor.query(
    "SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL",
    [categoryId],
  );
  return rows.length > 0;
};

const isValidIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const validateCategoryAttributes = (attributes, categoryAttributes) => {
  for (const field of categoryAttributes) {
    const value = attributes[field.key];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");

    if (field.required && isEmpty) {
      return `Parametr "${field.label}" jest wymagany dla tej kategorii.`;
    }
    if (isEmpty) continue;

    if (field.type === "number" && !Number.isFinite(Number(value))) {
      return `Parametr "${field.label}" musi być liczbą.`;
    }
    if (field.type === "date" && !isValidIsoDate(value)) {
      return `Parametr "${field.label}" musi być poprawną datą.`;
    }
    if (
      field.type === "select" &&
      (!Array.isArray(field.options) || !field.options.includes(value))
    ) {
      return `Parametr "${field.label}" ma wartość spoza listy wyboru.`;
    }
    if (field.type === "text" && typeof value !== "string") {
      return `Parametr "${field.label}" musi być tekstem.`;
    }
  }
  return null;
};

const getCategoryAttributes = async (executor, categoryId) => {
  const { rows } = await executor.query(
    "SELECT required_attributes FROM categories WHERE id = $1 AND deleted_at IS NULL",
    [categoryId],
  );
  if (rows.length === 0) return null;
  return Array.isArray(rows[0].required_attributes)
    ? rows[0].required_attributes
    : JSON.parse(rows[0].required_attributes || "[]");
};

const withTransaction = async (work) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Nie udało się wycofać transakcji:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};

const validateProductInput = (
  { categoryId, name, productCode, purchasePrice, sellingPrice, attributes },
  res,
) => {
  if (!categoryId || !name || !productCode) {
    res
      .status(400)
      .json({ message: "Nazwa, kod SKU oraz kategoria są wymagane." });
    return false;
  }

  if (
    purchasePrice === null ||
    purchasePrice < 0 ||
    sellingPrice === null ||
    sellingPrice < 0
  ) {
    res
      .status(400)
      .json({ message: "Ceny muszą być poprawnymi, nieujemnymi liczbami." });
    return false;
  }

  if (!isValidAttributes(attributes)) {
    res
      .status(400)
      .json({ message: "Atrybuty produktu muszą mieć poprawny format." });
    return false;
  }

  return true;
};

const getProducts = async (req, res) => {
  try {
    const query = `
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `;
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Błąd pobierania produktów:", error);
    res.status(500).json({ message: "Błąd pobierania produktów." });
  }
};

const getCategories = async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, name, description, required_attributes FROM categories WHERE deleted_at IS NULL ORDER BY id ASC",
    );
    res.json(rows);
  } catch (error) {
    console.error("Błąd pobierania kategorii:", error);
    res.status(500).json({ message: "Błąd pobierania kategorii." });
  }
};

const createProduct = async (req, res) => {
  const input = parseProductInput(req.body);
  const userId = req.user.id;

  if (!validateProductInput(input, res)) {
    return;
  }

  try {
    const newProduct = await withTransaction(async (client) => {
      if (!(await categoryExists(client, input.categoryId))) {
        const error = new Error("CATEGORY_NOT_FOUND");
        error.code = "CATEGORY_NOT_FOUND";
        throw error;
      }
      const attributesError = validateCategoryAttributes(
        input.attributes,
        await getCategoryAttributes(client, input.categoryId),
      );
      if (attributesError) {
        const error = new Error(attributesError);
        error.code = "PRODUCT_ATTRIBUTES_INVALID";
        throw error;
      }

      const nameCheck = await client.query(
        "SELECT 1 FROM products WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL",
        [input.name],
      );
      if (nameCheck.rows.length > 0) {
        const error = new Error("DUPLICATE_NAME");
        error.code = "DUPLICATE_NAME";
        throw error;
      }

      const insertQuery = `
        INSERT INTO products (category_id, name, product_code, quantity, purchase_price, selling_price, attributes)
        VALUES ($1, $2, $3, 0, $4, $5, $6)
        RETURNING *
      `;
      const values = [
        input.categoryId,
        input.name,
        input.productCode,
        input.purchasePrice,
        input.sellingPrice,
        JSON.stringify(input.attributes),
      ];
      const { rows } = await client.query(insertQuery, values);
      const product = rows[0];

      await logAudit(
        {
          actorId: userId,
          actorRole: req.user.roleName,
          action: "CREATE",
          entityType: "PRODUCT",
          entityId: product.id,
          oldData: {},
          newData: product,
        },
        client,
      );
      return product;
    });

    res.status(201).json({ message: "Dodano produkt.", product: newProduct });
  } catch (error) {
    console.error("Błąd dodawania produktu:", error);
    if (error.code === "CATEGORY_NOT_FOUND") {
      return res
        .status(400)
        .json({ message: "Wybrana kategoria nie istnieje." });
    }
    if (error.code === "DUPLICATE_NAME") {
      return res
        .status(409)
        .json({ message: "Produkt o takiej nazwie już istnieje w systemie." });
    }
    if (error.code === "PRODUCT_ATTRIBUTES_INVALID") {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Produkt o podanym kodzie SKU już istnieje w bazie.",
      });
    }
    res
      .status(500)
      .json({ message: "Błąd serwera podczas dodawania produktu." });
  }
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const input = parseProductInput(req.body);
  const userId = req.user.id;

  if (!validateProductInput(input, res)) {
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      if (!(await categoryExists(client, input.categoryId))) {
        const error = new Error("CATEGORY_NOT_FOUND");
        error.code = "CATEGORY_NOT_FOUND";
        throw error;
      }
      const attributesError = validateCategoryAttributes(
        input.attributes,
        await getCategoryAttributes(client, input.categoryId),
      );
      if (attributesError) {
        const error = new Error(attributesError);
        error.code = "PRODUCT_ATTRIBUTES_INVALID";
        throw error;
      }

      const nameCheck = await client.query(
        "SELECT 1 FROM products WHERE LOWER(name) = LOWER($1) AND id <> $2 AND deleted_at IS NULL",
        [input.name, id],
      );
      if (nameCheck.rows.length > 0) {
        const error = new Error("DUPLICATE_NAME");
        error.code = "DUPLICATE_NAME";
        throw error;
      }

      const oldProductRes = await client.query(
        "SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (oldProductRes.rows.length === 0) {
        return { notFound: true };
      }

      const oldProduct = oldProductRes.rows[0];
      const newAttributes = JSON.stringify(input.attributes);
      const oldAttributes = JSON.stringify(oldProduct.attributes || {});

      const isUnchanged =
        String(oldProduct.category_id) === String(input.categoryId) &&
        oldProduct.name === input.name &&
        oldProduct.product_code === input.productCode &&
        Number(oldProduct.purchase_price) === input.purchasePrice &&
        Number(oldProduct.selling_price) === input.sellingPrice &&
        oldAttributes === newAttributes;

      if (isUnchanged) {
        return { product: oldProduct, unchanged: true };
      }

      const updateQuery = `
        UPDATE products
        SET category_id = $1, name = $2, product_code = $3, purchase_price = $4, selling_price = $5, attributes = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `;
      const values = [
        input.categoryId,
        input.name,
        input.productCode,
        input.purchasePrice,
        input.sellingPrice,
        newAttributes,
        id,
      ];
      const { rows } = await client.query(updateQuery, values);
      const updatedProduct = rows[0];

      await logAudit(
        {
          actorId: userId,
          actorRole: req.user.roleName,
          action: "UPDATE",
          entityType: "PRODUCT",
          entityId: updatedProduct.id,
          oldData: oldProduct,
          newData: updatedProduct,
        },
        client,
      );
      return { product: updatedProduct };
    });

    if (result.notFound) {
      return res.status(404).json({ message: "Produkt nie istnieje." });
    }

    if (result.unchanged) {
      return res.json({
        message: "Brak zmian do zapisania.",
        product: result.product,
      });
    }

    res.json({ message: "Zaktualizowano produkt.", product: result.product });
  } catch (error) {
    console.error("Błąd edycji produktu:", error);
    if (error.code === "CATEGORY_NOT_FOUND") {
      return res
        .status(400)
        .json({ message: "Wybrana kategoria nie istnieje." });
    }
    if (error.code === "DUPLICATE_NAME") {
      return res
        .status(409)
        .json({ message: "Produkt o takiej nazwie już istnieje w systemie." });
    }
    if (error.code === "PRODUCT_ATTRIBUTES_INVALID") {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Inny produkt w bazie używa już tego kodu SKU." });
    }
    res.status(500).json({ message: "Błąd serwera podczas edycji produktu." });
  }
};

const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await withTransaction(async (client) => {
      const productRes = await client.query(
        "SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (productRes.rows.length === 0) {
        return { notFound: true };
      }

      const productToDelete = productRes.rows[0];

      await logAudit(
        {
          actorId: userId,
          actorRole: req.user.roleName,
          action: "DELETE",
          entityType: "PRODUCT",
          entityId: productToDelete.id,
          oldData: productToDelete,
          newData: {},
        },
        client,
      );
      await client.query(
        `UPDATE products
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );

      return { notFound: false };
    });

    if (!result || result.notFound) {
      return res.status(404).json({ message: "Produkt nie istnieje." });
    }

    return res.json({
      message: "Produkt został usunięty z aktywnego magazynu.",
    });
  } catch (error) {
    console.error("Błąd usuwania produktu:", error);
    return res
      .status(500)
      .json({ message: "Błąd serwera podczas usuwania produktu." });
  }
};

module.exports = {
  getProducts,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
};
