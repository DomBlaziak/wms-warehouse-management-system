jest.mock("../config/db", () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));
const {
  calculateFifoAllocation,
  isValidDate,
} = require("../controllers/movementController");

describe("Algorytm wyceny i rozchodu FIFO (calculateFifoAllocation)", () => {
  test("pobiera towar z najstarszej partii PZ niezależnie od kolejności danych wejściowych", () => {
    const movements = [
      {
        id: 2,
        movement_type: "IN",
        quantity: 10,
        unit_price: 150,
        movement_date: "2026-05-10",
        created_at: "2026-05-10T09:00:00Z",
      },
      {
        id: 1,
        movement_type: "IN",
        quantity: 8,
        unit_price: 100,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T09:00:00Z",
      },
    ];

    const result = calculateFifoAllocation(movements, 5);

    expect(result.remainingQuantity).toBe(0);
    expect(result.availableQuantity).toBe(18);
    expect(result.allocation).toEqual([
      {
        batchId: 1,
        date: "2026-05-01",
        quantity: 5,
        unitPrice: 100,
      },
    ]);
  });

  test("rozbija wydanie WZ na kilka partii o różnych cenach zakupu zgodnie z zasadą FIFO", () => {
    const movements = [
      {
        id: 1,
        movement_type: "IN",
        quantity: 4,
        unit_price: 200,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T08:00:00Z",
      },
      {
        id: 2,
        movement_type: "IN",
        quantity: 6,
        unit_price: 250,
        movement_date: "2026-05-05",
        created_at: "2026-05-05T08:00:00Z",
      },
    ];

    const result = calculateFifoAllocation(movements, 7);

    expect(result.remainingQuantity).toBe(0);
    expect(result.allocation).toEqual([
      { batchId: 1, date: "2026-05-01", quantity: 4, unitPrice: 200 },
      { batchId: 2, date: "2026-05-05", quantity: 3, unitPrice: 250 },
    ]);
  });

  test("uwzględnia wcześniejsze rozchody OUT przed przydzieleniem nowej partii", () => {
    const movements = [
      {
        id: 1,
        movement_type: "IN",
        quantity: 10,
        unit_price: 80,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T08:00:00Z",
      },
      {
        id: 2,
        movement_type: "OUT",
        quantity: 7,
        unit_price: 80,
        movement_date: "2026-05-02",
        created_at: "2026-05-02T08:00:00Z",
      },
      {
        id: 3,
        movement_type: "IN",
        quantity: 5,
        unit_price: 95,
        movement_date: "2026-05-03",
        created_at: "2026-05-03T08:00:00Z",
      },
    ];

    const result = calculateFifoAllocation(movements, 6);

    expect(result.availableQuantity).toBe(8);
    expect(result.remainingQuantity).toBe(0);
    expect(result.allocation).toEqual([
      { batchId: 1, date: "2026-05-01", quantity: 3, unitPrice: 80 },
      { batchId: 3, date: "2026-05-03", quantity: 3, unitPrice: 95 },
    ]);
  });

  test("zwraca niezerową brakującą ilość (remainingQuantity), gdy stan magazynowy jest niewystarczający", () => {
    const movements = [
      {
        id: 1,
        movement_type: "IN",
        quantity: 5,
        unit_price: 120,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T08:00:00Z",
      },
    ];

    const result = calculateFifoAllocation(movements, 9);

    expect(result.availableQuantity).toBe(5);
    expect(result.remainingQuantity).toBe(4);
    expect(result.allocation).toHaveLength(1);
  });

  test("poprawnie waliduje format daty dokumentu magazynowego (YYYY-MM-DD)", () => {
    expect(isValidDate("2026-05-18")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("18-05-2026")).toBe(false);
  });
});
