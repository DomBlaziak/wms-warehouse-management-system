const db = require("../config/db");

const getAuditLogs = async (req, res) => {
  try {
    const roleName = req.user.roleName || req.user.role_name;
    const isAdministrator = roleName === "Administrator";

    const query = `
      SELECT 
        a.id, 
        a.action, 
        a.entity_type,
        a.entity_id,
        a.old_data, 
        a.new_data, 
        a.changed_at, 
        u.username,
        COALESCE(
          p.name,
          a.old_data->>'name',
          a.new_data->>'name',
          a.old_data->>'username',
          a.new_data->>'username',
          'Konto / System'
        ) AS current_product_name
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN products p
        ON a.entity_type = 'PRODUCT' AND a.entity_id = p.id::text
      WHERE a.entity_type IN ('PRODUCT', 'CATEGORY', 'USER')
        AND (
          $1 = TRUE
          OR a.entity_type = 'PRODUCT'
        )
      ORDER BY a.changed_at DESC
    `;

    const { rows } = await db.query(query, [isAdministrator]);
    res.json(rows);
  } catch (error) {
    console.error("Błąd audytu:", error);
    res.status(500).json({ message: "Błąd pobierania historii audytu." });
  }
};

module.exports = { getAuditLogs };
