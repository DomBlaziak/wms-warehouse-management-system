const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Logowanie użytkownika
const login = async (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    return res.status(400).json({ message: "Login i hasło są wymagane." });
  }

  try {
    const userQuery = `
      SELECT u.id, u.username, u.first_name, u.last_name, u.password_hash, u.role_id, r.name as role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.username) = LOWER($1)
        AND u.deleted_at IS NULL
    `;
    const { rows } = await db.query(userQuery, [username.trim()]);

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Nieprawidłowy login lub hasło." });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ message: "Nieprawidłowy login lub hasło." });
    }

    const roleName = user.role_name || "Użytkownik";
    const tokenPayload = {
      id: user.id,
      username: user.username,
      roleName,
      role_name: roleName,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: process.env.COOKIE_SAME_SITE || "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({
      message: "Zalogowano pomyślnie!",
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        roleName: user.role_name,
      },
    });
  } catch (error) {
    console.error("Błąd logowania:", error);
    res.status(500).json({ message: "Błąd serwera podczas logowania." });
  }
};

// Zgłoszenie prośby o reset hasła
const resetRequest = async (req, res) => {
  const { username } = req.body;

  if (typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ message: "Proszę podać login użytkownika." });
  }

  try {
    const query =
      "SELECT id, username FROM users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL";
    const { rows } = await db.query(query, [username.trim()]);

    res.json({
      message:
        "Jeśli konto istnieje, zgłoszenie resetu zostało zarejestrowane.",
    });
  } catch (error) {
    console.error("Błąd podczas prośby o reset:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas przetwarzania zgłoszenia." });
  }
};

const logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Wylogowano pomyślnie." });
};

module.exports = { login, logout, resetRequest };
