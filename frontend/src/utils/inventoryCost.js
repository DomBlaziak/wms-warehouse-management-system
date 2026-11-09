const compareMovements = (a, b) => {
  const dateDifference =
    new Date(a.movement_date).getTime() - new Date(b.movement_date).getTime();
  if (dateDifference !== 0) return dateDifference;

  const createdDifference =
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdDifference !== 0) return createdDifference;

  return String(a.id).localeCompare(String(b.id));
};

export const getActiveInventoryBatches = (product, movements = []) => {
  if (!product) return [];

  const ledgerQuantity = movements.reduce((total, movement) => {
    const quantity = Number(movement.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return total;

    return (
      total +
      (String(movement.movement_type).toUpperCase() === "IN"
        ? quantity
        : -quantity)
    );
  }, 0);

  const openingQuantity = Math.max(
    0,
    Number(product.quantity || 0) - ledgerQuantity,
  );
  const batches =
    openingQuantity > 0
      ? [
          {
            id: `opening-${product.id}`,
            quantityAvailable: openingQuantity,
            unitPrice: Number(product.purchase_price ?? product.price) || 0,
          },
        ]
      : [];

  [...movements].sort(compareMovements).forEach((movement) => {
    const quantity = Number(movement.quantity);
    const movementType = String(movement.movement_type).toUpperCase();
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    if (movementType === "IN") {
      batches.push({
        id: movement.id,
        quantityAvailable: quantity,
        unitPrice: Number(movement.unit_price) || 0,
      });
      return;
    }

    if (movementType === "OUT") {
      let remaining = quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const taken = Math.min(batch.quantityAvailable, remaining);
        batch.quantityAvailable -= taken;
        remaining -= taken;
      }
    }
  });

  return batches.filter((batch) => batch.quantityAvailable > 0);
};

export const getInventoryCostSummary = (product, movements = []) => {
  const batches = getActiveInventoryBatches(product, movements);
  const quantity = batches.reduce(
    (sum, batch) => sum + batch.quantityAvailable,
    0,
  );
  const totalCost = batches.reduce(
    (sum, batch) => sum + batch.quantityAvailable * batch.unitPrice,
    0,
  );

  return {
    batches,
    quantity,
    totalCost,
    averageCost: quantity > 0 ? totalCost / quantity : 0,
  };
};
