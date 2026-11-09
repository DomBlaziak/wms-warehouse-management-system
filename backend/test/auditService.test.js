const test = require("node:test");
const assert = require("node:assert/strict");
const { hasChanges, logAudit } = require("../services/auditService");

test("ignores technical timestamp changes when comparing audit data", () => {
  assert.equal(
    hasChanges(
      {
        name: "Elektronika",
        updated_at: new Date("2026-01-01T10:00:00.000Z"),
      },
      {
        name: "Elektronika",
        updated_at: new Date("2026-01-01T10:01:00.000Z"),
      },
    ),
    false,
  );
});

test("treats reordered object keys as unchanged", () => {
  assert.equal(
    hasChanges(
      { required_attributes: { width: 10, height: 20 } },
      { required_attributes: { height: 20, width: 10 } },
    ),
    false,
  );
});

test("detects business field changes", () => {
  assert.equal(
    hasChanges({ name: "Elektronika" }, { name: "Narzędzia" }),
    true,
  );
});

test("does not insert an audit record for an unchanged update", async () => {
  let queryCalled = false;
  const executor = {
    query: async () => {
      queryCalled = true;
      throw new Error("INSERT should not be called");
    },
  };

  const result = await logAudit(
    {
      actorId: 1,
      actorRole: "Administrator",
      action: "UPDATE",
      entityType: "CATEGORY",
      entityId: 7,
      oldData: { name: "Elektronika", updated_at: new Date("2026-01-01") },
      newData: { name: "Elektronika", updated_at: new Date("2026-01-02") },
    },
    executor,
  );

  assert.equal(result, null);
  assert.equal(queryCalled, false);
});

test("treats JSON string and parsed category fields as equal", () => {
  assert.equal(
    hasChanges(
      {
        required_attributes: JSON.stringify([
          { key: "height", label: "Wysokość", type: "number", options: [] },
          { key: "width", label: "Szerokość", type: "number", options: [] },
        ]),
      },
      {
        required_attributes: [
          { options: [], type: "number", label: "Wysokość", key: "height" },
          { options: [], type: "number", label: "Szerokość", key: "width" },
        ],
      },
    ),
    false,
  );
});

test("skips unchanged role changes as well as regular updates", async () => {
  const executor = {
    query: async () => {
      throw new Error("INSERT should not be called");
    },
  };

  const result = await logAudit(
    {
      actorId: 1,
      action: "USER_ROLE_CHANGED",
      entityType: "USER",
      oldData: { role_id: 2 },
      newData: { role_id: 2 },
    },
    executor,
  );

  assert.equal(result, null);
});
