const jwt = require("jsonwebtoken");
const db = require("../config/db");
require("dotenv").config();

const normalizeRoleName = (roleName) => {
  if (typeof roleName !== "string") return "";
  return roleName.trim();
};

async function authenticateToken(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization && req.headers.authorization.split(" ")[1]);

  if (!token) {
    return res.status(401).json({ message: "Brak tokenu. Dostęp zabroniony." });
  }

  let tokenUser;
  try {
    tokenUser = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Token nieprawidłowy lub wygasł." });
  }

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, r.name AS role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1
         AND u.deleted_at IS NULL`,
      [tokenUser.id],
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Sesja użytkownika jest nieaktywna." });
    }

    const currentUser = rows[0];
    const resolvedRole = normalizeRoleName(currentUser.role_name);
    req.user = {
      ...tokenUser,
      id: currentUser.id,
      username: currentUser.username,
      firstName: currentUser.first_name,
      lastName: currentUser.last_name,
      roleName: resolvedRole,
      role_name: resolvedRole,
    };
    return next();
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Błąd weryfikacji tożsamości użytkownika." });
  }
}

function authorizeRoles(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles.map((role) =>
    normalizeRoleName(role),
  );

  return (req, res, next) => {
    const currentRole = normalizeRoleName(req.user?.roleName);

    if (!req.user || !normalizedAllowedRoles.includes(currentRole)) {
      return res
        .status(403)
        .json({ message: "Brak uprawnień do tej operacji." });
    }

    next();
  };
}

module.exports = { authenticateToken, authorizeRoles };
