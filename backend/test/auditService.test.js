jest.mock("../config/db", () => ({ query: jest.fn() }));
const { hasChanges, logAudit } = require("../services/auditService");

describe("Moduł audytu (auditService)", () => {
  test("ignoruje zmianę kolejności kluczy w dynamicznych atrybutach JSONB", () => {
    const oldData = {
      name: "Dell Latitude",
      attributes: { ram: "16GB", cpu: "Intel Core i7", dysk: "512GB" },
    };
    const newData = {
      name: "Dell Latitude",
      attributes: { dysk: "512GB", ram: "16GB", cpu: "Intel Core i7" },
    };

    expect(hasChanges(oldData, newData)).toBe(false);
  });
  test("pomija pola techniczne takie jak updated_at podczas porównywania rekordów", () => {
    const oldData = {
      id: 12,
      quantity: 10,
      updated_at: "2026-05-10T10:00:00.000Z",
    };
    const newData = {
      id: 12,
      quantity: 10,
      updated_at: "2026-05-12T14:30:00.000Z",
    };

    expect(hasChanges(oldData, newData)).toBe(false);
  });
  test("wykrywa faktyczną modyfikację wartości wewnątrz obiektu JSONB", () => {
    const oldData = {
      name: "Monitor LG 27",
      attributes: JSON.stringify({ przekatna: "27", matryca: "IPS" }),
    };
    const newData = {
      name: "Monitor LG 27",
      attributes: { przekatna: "27", matryca: "OLED" },
    };

    expect(hasChanges(oldData, newData)).toBe(true);
  });
  test("nie zapisuje wpisu w dzienniku dla akcji UPDATE, gdy dane nie uległy zmianie", async () => {
    const mockExecutor = { query: jest.fn() };
    const result = await logAudit(
      {
        actorId: 1,
        actorRole: "Admin",
        action: "UPDATE",
        entityType: "PRODUCT",
        entityId: 12,
        oldData: { name: "Klawiatura", quantity: 5 },
        newData: { name: "Klawiatura", quantity: 5 },
      },
      mockExecutor,
    );

    expect(result).toBeNull();
    expect(mockExecutor.query).not.toHaveBeenCalled();
  });
});
