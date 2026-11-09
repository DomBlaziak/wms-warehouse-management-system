const db = require("../config/db");
const { logAudit } = require("../services/auditService");

const FIELD_TYPES = new Set(["text", "number", "select", "date"]);
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const validateRequiredAttributes = (value) => {
  if (value === undefined) return { attributes: [] };
  if (!Array.isArray(value)) {
    return { error: "Definicja pól kategorii musi być listą." };
  }

  const keys = new Set();
  const attributes = [];

  for (let index = 0; index < value.length; index += 1) {
    const field = value[index];
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return { error: `Pole kategorii #${index + 1} ma nieprawidłowy format.` };
    }

    const key = typeof field.key === "string" ? field.key.trim() : "";
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const type = typeof field.type === "string" ? field.type : "";

    if (!key || !FIELD_KEY_PATTERN.test(key)) {
      return {
        error: `Pole kategorii #${index + 1} ma nieprawidłowy klucz techniczny.`,
      };
    }
    if (keys.has(key)) {
      return { error: `Klucz pola "${key}" został użyty więcej niż raz.` };
    }
    if (!label) {
      return { error: `Pole "${key}" musi mieć widoczną nazwę.` };
    }
    if (!FIELD_TYPES.has(type)) {
      return { error: `Pole "${label}" ma nieobsługiwany typ.` };
    }
    if (typeof field.required !== "boolean") {
      return {
        error: `Pole "${label}" musi mieć określenie wymagane/opcjonalne.`,
      };
    }
    if (typeof field.unit !== "string") {
      return { error: `Jednostka pola "${label}" ma nieprawidłowy format.` };
    }

    const options = field.options === undefined ? [] : field.options;
    if (!Array.isArray(options)) {
      return { error: `Opcje pola "${label}" muszą być listą.` };
    }
    if (type === "select") {
      const cleanOptions = options.map((option) =>
        typeof option === "string" ? option.trim() : "",
      );
      if (
        cleanOptions.some((option) => !option) ||
        new Set(cleanOptions).size !== cleanOptions.length
      ) {
        return {
          error: `Pole "${label}" musi mieć niepuste i unikalne opcje.`,
        };
      }
      attributes.push({ ...field, key, label, type, options: cleanOptions });
    } else {
      attributes.push({ ...field, key, label, type, options: [] });
    }
    keys.add(key);
  }

  return { attributes };
};

const validateCategoryInput = (body = {}) => {
  if (typeof body.name !== "string" || !body.name.trim()) {
    return { error: "Nazwa kategorii jest wymagana." };
  }

  const attributeResult = validateRequiredAttributes(body.requiredAttributes);
  if (attributeResult.error) return attributeResult;

  return {
    name: body.name.trim(),
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    attributes: attributeResult.attributes,
  };
};

const createCategory = async (req, res) => {
  const input = validateCategoryInput(req.body);
  if (input.error) {
    return res.status(400).json({ message: input.error });
  }

  try {
    const query = `
      INSERT INTO categories (name, description, required_attributes)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [
      input.name,
      input.description,
      JSON.stringify(input.attributes),
    ];

    const { rows } = await db.query(query, values);
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.roleName,
      action: "CREATE",
      entityType: "CATEGORY",
      entityId: rows[0].id,
      oldData: {},
      newData: rows[0],
    });
    res
      .status(201)
      .json({ message: "Pomyślnie utworzono kategorię.", category: rows[0] });
  } catch (error) {
    console.error("Błąd tworzenia kategorii:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Kategoria o takiej nazwie już istnieje." });
    }
    res
      .status(500)
      .json({ message: "Błąd serwera podczas tworzenia kategorii." });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const input = validateCategoryInput(req.body);
  if (input.error) {
    return res.status(400).json({ message: input.error });
  }

  try {
    const query = `
      UPDATE categories
      SET name = $1, description = $2, required_attributes = $3
      WHERE id = $4 AND deleted_at IS NULL
      RETURNING *
    `;
    const values = [
      input.name,
      input.description,
      JSON.stringify(input.attributes),
      id,
    ];

    const previousResult = await db.query(
      "SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    if (previousResult.rows.length === 0) {
      return res.status(404).json({ message: "Kategoria nie istnieje." });
    }

    const { rows } = await db.query(query, values);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Kategoria nie istnieje." });
    }
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.roleName,
      action: "UPDATE",
      entityType: "CATEGORY",
      entityId: rows[0].id,
      oldData: previousResult.rows[0],
      newData: rows[0],
    });

    res.json({
      message: "Pomyślnie zaktualizowano kategorię.",
      category: rows[0],
    });
  } catch (error) {
    console.error("Błąd aktualizacji kategorii:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Inna kategoria używa już tej nazwy." });
    }
    res
      .status(500)
      .json({ message: "Błąd serwera podczas aktualizacji kategorii." });
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;

  try {
    const checkProductsQuery =
      "SELECT COUNT(*) FROM products WHERE category_id = $1";
    const { rows: countRows } = await db.query(checkProductsQuery, [id]);
    const productsCount = parseInt(countRows[0].count, 10);

    if (productsCount > 0) {
      return res.status(400).json({
        message: `Nie można usunąć tej kategorii! Jest do niej przypisanych ${productsCount} produktów.`,
      });
    }

    const categoryResult = await db.query(
      "SELECT * FROM categories WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: "Kategoria nie istnieje." });
    }

    const deleteQuery = `
      UPDATE categories
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const { rows } = await db.query(deleteQuery, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Kategoria nie istnieje." });
    }
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.roleName,
      action: "DELETE",
      entityType: "CATEGORY",
      entityId: rows[0].id,
      oldData: categoryResult.rows[0],
      newData: {},
    });

    res.json({
      message: `Kategoria "${rows[0].name}" została zarchiwizowana.`,
    });
  } catch (error) {
    console.error("Błąd usuwania kategorii:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas usuwania kategorii." });
  }
};

module.exports = { createCategory, updateCategory, deleteCategory };
