const db = require("../config/db");

const TECHNICAL_FIELDS = new Set(["created_at", "updated_at", "deleted_at"]);
const JSON_FIELDS = new Set(["attributes", "required_attributes"]);

const normalizeForComparison = (value, key = null) => {
  if (TECHNICAL_FIELDS.has(key)) return undefined;

  if (JSON_FIELDS.has(key) && typeof value === "string") {
    try {
      return normalizeForComparison(JSON.parse(value), key);
    } catch {
      return value;
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((normalized, childKey) => {
        const childValue = normalizeForComparison(value[childKey], childKey);
        if (childValue !== undefined) normalized[childKey] = childValue;
        return normalized;
      }, {});
  }
  return value;
};

const hasChanges = (oldData = {}, newData = {}) =>
  JSON.stringify(normalizeForComparison(oldData)) !==
  JSON.stringify(normalizeForComparison(newData));

const logAudit = async (
  {
    actorId,
    actorRole,
    action,
    entityType,
    entityId = null,
    oldData = {},
    newData = {},
  },
  executor = db,
) => {
  const isCreateOrDelete = ["CREATE", "INSERT", "DELETE"].includes(action);
  if (!isCreateOrDelete && !hasChanges(oldData, newData)) {
    return null;
  }

  const query = `
    INSERT INTO audit_log (
      user_id, action, entity_type, entity_id, old_data, new_data
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [
    actorId,
    action,
    entityType,
    entityId === null ? null : String(entityId),
    oldData,
    newData,
  ];
  const { rows } = await executor.query(query, values);

  const timestamp = new Date().toLocaleTimeString("pl-PL");
  console.log(
    `[AUDIT LOG ${timestamp}] ${actorRole || "Unknown"} zarejestrował akcję: ${action}`,
  );

  return rows[0];
};

module.exports = { hasChanges, logAudit };
