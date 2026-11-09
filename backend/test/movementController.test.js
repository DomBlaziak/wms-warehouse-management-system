const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateFifoAllocation,
  isValidDate,
} = require("../controllers/movementController");

test("FIFO allocates stock from the oldest available batch", () => {
  const result = calculateFifoAllocation(
    [
      {
        id: 2,
        movement_type: "IN",
        quantity: 5,
        unit_price: 12,
        movement_date: "2026-01-02",
        created_at: "2026-01-02T10:00:00Z",
      },
      {
        id: 1,
        movement_type: "IN",
        quantity: 3,
        unit_price: 10,
        movement_date: "2026-01-01",
        created_at: "2026-01-01T10:00:00Z",
      },
    ],
    6,
  );

  assert.deepEqual(
    result.allocation.map(({ batchId, quantity, unitPrice }) => ({
      batchId,
      quantity,
      unitPrice,
    })),
    [
      { batchId: 1, quantity: 3, unitPrice: 10 },
      { batchId: 2, quantity: 3, unitPrice: 12 },
    ],
  );
  assert.equal(result.remainingQuantity, 0);
});

test("date validation accepts real ISO dates only", () => {
  assert.equal(isValidDate("2026-02-28"), true);
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("28.02.2026"), false);
});
