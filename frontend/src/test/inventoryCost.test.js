import {
  getActiveInventoryBatches,
  getInventoryCostSummary,
} from "../utils/inventoryCost";

describe("Moduł wyceny zapasów po stronie klienta (inventoryCost)", () => {
  test("wylicza wartość aktywnych partii oraz średni koszt jednostkowy po przyjęciach PZ", () => {
    const product = { id: 1, quantity: 10, purchase_price: 100 };
    const movements = [
      {
        id: 10,
        movement_type: "IN",
        quantity: 4,
        unit_price: 100,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T10:00:00Z",
      },
      {
        id: 11,
        movement_type: "IN",
        quantity: 6,
        unit_price: 150,
        movement_date: "2026-05-05",
        created_at: "2026-05-05T10:00:00Z",
      },
    ];

    const summary = getInventoryCostSummary(product, movements);

    expect(summary.quantity).toBe(10);
    expect(summary.totalCost).toBe(1300); // 4 * 100 + 6 * 150
    expect(summary.averageCost).toBe(130);
    expect(summary.batches).toHaveLength(2);
  });

  test("aktualizuje wycenę po częściowym wydaniu WZ zgodnie z kolejnością FIFO", () => {
    const product = { id: 1, quantity: 5, purchase_price: 150 };
    const movements = [
      {
        id: 10,
        movement_type: "IN",
        quantity: 4,
        unit_price: 100,
        movement_date: "2026-05-01",
        created_at: "2026-05-01T10:00:00Z",
      },
      {
        id: 11,
        movement_type: "IN",
        quantity: 6,
        unit_price: 150,
        movement_date: "2026-05-05",
        created_at: "2026-05-05T10:00:00Z",
      },
      {
        id: 12,
        movement_type: "OUT",
        quantity: 5,
        unit_price: 100,
        movement_date: "2026-05-06",
        created_at: "2026-05-06T10:00:00Z",
      },
    ];

    const summary = getInventoryCostSummary(product, movements);

    expect(summary.quantity).toBe(5);
    expect(summary.totalCost).toBe(750); // pozostało 5 szt. po 150 zł
    expect(summary.averageCost).toBe(150);
    expect(summary.batches).toEqual([
      { id: 11, quantityAvailable: 5, unitPrice: 150 },
    ]);
  });

  test("uwzględnia bilans otwarcia (openingBalance), gdy stan produktu przewyższa sumę zapisanych przyjęć", () => {
    const product = { id: 7, quantity: 8, purchase_price: 200 };
    const movements = [
      {
        id: 21,
        movement_type: "IN",
        quantity: 5,
        unit_price: 240,
        movement_date: "2026-05-10",
        created_at: "2026-05-10T09:00:00Z",
      },
    ];

    const batches = getActiveInventoryBatches(product, movements);

    expect(batches).toEqual([
      { id: "opening-7", quantityAvailable: 3, unitPrice: 200 },
      { id: 21, quantityAvailable: 5, unitPrice: 240 },
    ]);
  });

  test("zwraca zerowe podsumowanie dla pustego stanu lub braku obiektu produktu", () => {
    expect(getInventoryCostSummary(null, [])).toEqual({
      batches: [],
      quantity: 0,
      totalCost: 0,
      averageCost: 0,
    });

    expect(getInventoryCostSummary({ id: 2, quantity: 0 }, [])).toEqual({
      batches: [],
      quantity: 0,
      totalCost: 0,
      averageCost: 0,
    });
  });
});
