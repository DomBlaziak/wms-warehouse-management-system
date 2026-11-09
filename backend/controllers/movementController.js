const db = require("../config/db");

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

const parsePositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (!/^[1-9]\d*$/.test(String(normalizedValue))) return null;
  const num = Number(normalizedValue);
  return Number.isSafeInteger(num) ? num : null;
};

const isValidDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const parsePrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const normalizeNotes = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const compareMovements = (a, b) => {
  const dateDifference =
    new Date(a.movement_date).getTime() - new Date(b.movement_date).getTime();
  if (dateDifference !== 0) return dateDifference;

  const createdDifference =
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdDifference !== 0) return createdDifference;

  return String(a.id).localeCompare(String(b.id));
};

const calculateFifoAllocation = (
  movements,
  requestedQuantity,
  openingBalance = null,
) => {
  const batches = openingBalance?.quantity > 0 ? [{ ...openingBalance }] : [];

  for (const movement of [...movements].sort(compareMovements)) {
    const quantity = Number(movement.quantity);
    const movementType = String(movement.movement_type).toUpperCase();

    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    if (movementType === "IN") {
      batches.push({
        id: movement.id,
        date: movement.movement_date,
        quantityAvailable: quantity,
        unitPrice: Number(movement.unit_price),
      });
      continue;
    }

    if (movementType === "OUT") {
      let quantityToSubtract = quantity;
      for (const batch of batches) {
        if (quantityToSubtract <= 0) break;
        const quantityFromBatch = Math.min(
          batch.quantityAvailable,
          quantityToSubtract,
        );
        batch.quantityAvailable -= quantityFromBatch;
        quantityToSubtract -= quantityFromBatch;
      }
    }
  }

  const activeBatches = batches.filter((batch) => batch.quantityAvailable > 0);
  const totalAvailableQuantity = activeBatches.reduce(
    (sum, batch) => sum + batch.quantityAvailable,
    0,
  );
  const allocation = [];
  let remainingQuantity = requestedQuantity;

  for (const batch of activeBatches) {
    if (remainingQuantity <= 0) break;
    if (batch.quantityAvailable <= 0) continue;

    const quantityFromBatch = Math.min(
      batch.quantityAvailable,
      remainingQuantity,
    );
    allocation.push({
      batchId: batch.id,
      date: batch.date,
      quantity: quantityFromBatch,
      unitPrice: batch.unitPrice,
    });
    remainingQuantity -= quantityFromBatch;
  }

  return {
    allocation,
    remainingQuantity,
    availableQuantity: totalAvailableQuantity,
  };
};

// PRZYJĘCIE TOWARU (Dokument PZ - IN)
const createMovementIn = async (req, res) => {
  const { productId, quantity, unitPrice, movementDate, notes } = req.body;
  const userId = req.user.id;

  const parsedQty = parsePositiveInteger(quantity);
  const parsedPrice = parsePrice(unitPrice);

  if (
    !productId ||
    parsedQty === null ||
    parsedPrice === null ||
    !isValidDate(movementDate)
  ) {
    return res.status(400).json({
      message:
        "Wszystkie wymagane pola (produkt, dodatnia ilość, cena >= 0, data) muszą być poprawnie wypełnione.",
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const prodRes = await client.query(
        "SELECT id, quantity, purchase_price, selling_price, created_at FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [productId],
      );
      if (prodRes.rows.length === 0) {
        return { notFound: true };
      }

      const movementQuery = `
        INSERT INTO inventory_movements (product_id, user_id, movement_type, quantity, unit_price, movement_date, notes)
        VALUES ($1, $2, 'IN', $3, $4, $5, $6)
        RETURNING *
      `;
      const movementRes = await client.query(movementQuery, [
        productId,
        userId,
        parsedQty,
        parsedPrice,
        movementDate,
        normalizeNotes(notes),
      ]);

      const updateProductQuery = `
        UPDATE products
        SET quantity = quantity + $1, purchase_price = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      const productRes = await client.query(updateProductQuery, [
        parsedQty,
        parsedPrice,
        productId,
      ]);

      return {
        movement: movementRes.rows[0],
        product: productRes.rows[0],
      };
    });

    if (result.notFound) {
      return res.status(404).json({ message: "Wybrany produkt nie istnieje." });
    }

    return res.status(201).json({
      message: "Zarejestrowano przyjęcie towaru (PZ).",
      movement: result.movement,
      product: result.product,
    });
  } catch (error) {
    console.error("Błąd podczas rejestracji PZ:", error);
    return res
      .status(500)
      .json({ message: "Błąd serwera podczas zapisywania przyjęcia." });
  }
};

// WYDANIE TOWARU (Dokument WZ - OUT z algorytmem FIFO)
const createMovementOut = async (req, res) => {
  const { productId, quantity, movementDate, notes } = req.body;
  const userId = req.user.id;

  const parsedQty = parsePositiveInteger(quantity);

  if (!productId || parsedQty === null || !isValidDate(movementDate)) {
    return res.status(400).json({
      message:
        "Wszystkie wymagane pola (produkt, dodatnia ilość, data) muszą być poprawnie wypełnione.",
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      const prodRes = await client.query(
        "SELECT id, quantity, purchase_price, selling_price, created_at FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [productId],
      );
      if (prodRes.rows.length === 0) {
        return { notFound: true };
      }

      const product = prodRes.rows[0];

      if (product.quantity < parsedQty) {
        return { insufficientStock: true, currentStock: product.quantity };
      }

      const movementsRes = await client.query(
        `SELECT id, movement_type, quantity, unit_price, selling_price, movement_date, created_at
         FROM inventory_movements 
         WHERE product_id = $1 
         ORDER BY movement_date ASC, created_at ASC, id ASC`,
        [productId],
      );

      const ledgerQuantity = movementsRes.rows.reduce((total, movement) => {
        const quantity = Number(movement.quantity);
        return (
          total +
          (String(movement.movement_type).toUpperCase() === "IN"
            ? quantity
            : -quantity)
        );
      }, 0);
      const openingQuantity = Number(product.quantity) - ledgerQuantity;
      const openingBalance =
        openingQuantity > 0
          ? {
              id: `opening-${product.id}`,
              date: product.created_at,
              quantityAvailable: openingQuantity,
              unitPrice: Number(product.purchase_price) || 0,
            }
          : null;

      const fifoResult = calculateFifoAllocation(
        movementsRes.rows,
        parsedQty,
        openingBalance,
      );
      if (fifoResult.remainingQuantity > 0) {
        return {
          inconsistentHistory: true,
          availableFromHistory: fifoResult.availableQuantity,
          requestedQuantity: parsedQty,
          currentStock: product.quantity,
          ledgerQuantity,
        };
      }

      let createdMovements = [];

      for (const batch of fifoResult.allocation) {
        const movementQuery = `
          INSERT INTO inventory_movements (product_id, user_id, movement_type, quantity, unit_price, selling_price, movement_date, notes)
          VALUES ($1, $2, 'OUT', $3, $4, $5, $6, $7)
          RETURNING *
        `;
        const movementRes = await client.query(movementQuery, [
          productId,
          userId,
          batch.quantity,
          batch.unitPrice,
          Number(product.selling_price) || 0,
          movementDate,
          normalizeNotes(notes),
        ]);

        createdMovements.push(movementRes.rows[0]);
      }

      const updateProductQuery = `
        UPDATE products
        SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const productRes = await client.query(updateProductQuery, [
        parsedQty,
        productId,
      ]);

      return {
        movements: createdMovements,
        product: productRes.rows[0],
        allocation: fifoResult.allocation,
      };
    });

    if (result.notFound) {
      return res.status(404).json({ message: "Wybrany produkt nie istnieje." });
    }

    if (result.insufficientStock) {
      return res.status(400).json({
        message: `Brak wystarczającej ilości towaru na magazynie. Dostępny stan: ${result.currentStock} szt.`,
      });
    }

    if (result.inconsistentHistory) {
      return res.status(409).json({
        message: `Historia partii nie pokrywa wydania. Dostępne wg FIFO: ${result.availableFromHistory} szt., żądano: ${result.requestedQuantity} szt. Stan kartoteki: ${result.currentStock} szt. Wydanie anulowano.`,
        availableFromHistory: result.availableFromHistory,
        currentStock: result.currentStock,
        ledgerQuantity: result.ledgerQuantity,
      });
    }

    return res.status(201).json({
      message: "Zarejestrowano wydanie towaru (WZ) metodą FIFO.",
      movements: result.movements,
      product: result.product,
      allocation: result.allocation,
    });
  } catch (error) {
    console.error("Błąd podczas rejestracji WZ:", error);
    return res
      .status(500)
      .json({ message: "Błąd serwera podczas zapisywania wydania." });
  }
};

// Pobieranie wszystkich ruchów magazynowych
const getMovements = async (req, res) => {
  try {
    const { productId } = req.query;
    let query = `
      SELECT m.id, m.product_id, m.user_id, m.movement_type, m.quantity, m.unit_price,
             m.selling_price,
             TO_CHAR(m.movement_date, 'YYYY-MM-DD') as movement_date, 
             m.created_at, m.notes, p.name as product_name, p.product_code, u.username
      FROM inventory_movements m
      JOIN products p ON m.product_id = p.id
      LEFT JOIN users u ON m.user_id = u.id
    `;
    const params = [];

    if (productId) {
      query += ` WHERE m.product_id = $1`;
      params.push(productId);
    }

    query += ` ORDER BY m.movement_date ASC, m.created_at ASC, m.id ASC`;

    const { rows } = await db.query(query, params);
    return res.json(rows);
  } catch (error) {
    console.error("Błąd pobierania ruchów magazynowych:", error);
    return res
      .status(500)
      .json({ message: "Błąd pobierania historii ruchów." });
  }
};

module.exports = {
  createMovementIn,
  createMovementOut,
  getMovements,
  calculateFifoAllocation,
  isValidDate,
};
