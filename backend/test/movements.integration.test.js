const request = require("supertest");
const jwt = require("jsonwebtoken");
const { app } = require("../server");
const db = require("../config/db");

const TEST_PRODUCT_ID = "b75b1773-8c78-4b8f-bd9c-a39e413ec7ed";

describe("Testy integracyjne API ruchu magazynowego i autoryzacji (Supertest + PostgreSQL)", () => {
  let warehouseCookie;
  let initialStock;
  let createdMovementId = null;

  beforeAll(async () => {
    const warehouseRes = await db.query(
      `SELECT u.id, u.username
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.name IN ('Magazynier', 'Kierownik') AND u.deleted_at IS NULL
       LIMIT 1`,
    );

    const prodRes = await db.query(
      "SELECT quantity FROM products WHERE id = $1 AND deleted_at IS NULL",
      [TEST_PRODUCT_ID],
    );
    initialStock = Number(prodRes.rows[0].quantity);

    const warehouseToken = jwt.sign(
      { id: warehouseRes.rows[0].id, username: warehouseRes.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    warehouseCookie = `token=${warehouseToken}`;
  });

  afterAll(async () => {
    if (createdMovementId) {
      await db.query("DELETE FROM inventory_movements WHERE id = $1", [
        createdMovementId,
      ]);
      await db.query(
        "UPDATE products SET quantity = $1, updated_at = NOW() WHERE id = $2",
        [initialStock, TEST_PRODUCT_ID],
      );
    }
    await db.pool.end();
  });

  test("GET /api/health potwierdza aktywne połączenie serwera Express z bazą PostgreSQL", async () => {
    const res = await request(app).get("/api/health");

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("POST /api/movements/in odrzuca żądanie bez ważnego tokenu JWT (401 Unauthorized)", async () => {
    const res = await request(app).post("/api/movements/in").send({
      productId: TEST_PRODUCT_ID,
      quantity: 2,
      unitPrice: 570,
      movementDate: "2026-11-18",
    });

    expect(res.statusCode).toBe(401);
  });

  test("POST /api/users blokuje nieuprawnioną rolę przez warstwę RBAC (403 Forbidden)", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", [warehouseCookie])
      .send({
        username: "test_rbac_user",
        password: "HasloTestowe123!",
        roleId: 3,
      });

    expect(res.statusCode).toBe(403);
  });

  test("POST /api/movements/in zapisuje dokument PZ w bazie i zwiększa stan produktu (201 Created)", async () => {
    const res = await request(app)
      .post("/api/movements/in")
      .set("Cookie", [warehouseCookie])
      .send({
        productId: TEST_PRODUCT_ID,
        quantity: 3,
        unitPrice: 570,
        movementDate: "2026-11-18",
        notes: "Automatyczny test integracyjny Supertest",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.movement).toBeDefined();
    expect(Number(res.body.product.quantity)).toBe(initialStock + 3);
    createdMovementId = res.body.movement.id;
  });

  test("POST /api/movements/out odrzuca wydanie WZ przekraczające stan magazynowy (400 Bad Request)", async () => {
    const res = await request(app)
      .post("/api/movements/out")
      .set("Cookie", [warehouseCookie])
      .send({
        productId: TEST_PRODUCT_ID,
        quantity: 99999,
        movementDate: "2026-11-18",
        notes: "Test przekroczenia stanu",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Brak wystarczającej ilości towaru/i);
  });
});
