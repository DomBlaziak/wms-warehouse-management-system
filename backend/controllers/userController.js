const db = require("../config/db");
const bcrypt = require("bcrypt");
const { logAudit } = require("../services/auditService");

const getRoleName = async (roleId) => {
  const { rows } = await db.query("SELECT name FROM roles WHERE id = $1", [
    roleId,
  ]);
  return rows[0]?.name || null;
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePolishText = (value) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const generateUniqueUsername = (firstName, lastName) => {
  if (!firstName || !lastName) return "";
  const cleanFn = normalizePolishText(firstName);
  const cleanLn = normalizePolishText(lastName);
  return `${cleanFn.charAt(0)}.${cleanLn}`;
};

const parsePositiveInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (!/^[1-9]\d*$/.test(String(normalizedValue))) {
    return null;
  }

  const parsed = Number(normalizedValue);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const roleExists = async (roleId) => {
  const { rows } = await db.query("SELECT 1 FROM roles WHERE id = $1", [
    roleId,
  ]);
  return rows.length > 0;
};

// Pobieranie wszystkich użytkowników z nazwą roli
const getAllUsers = async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.username, u.first_name, u.last_name, u.role_id, r.name as role_name, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `;
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Błąd podczas pobierania użytkowników:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas pobierania listy użytkowników." });
  }
};

// Pobieranie dostępnych ról ze słownika
const getRoles = async (req, res) => {
  try {
    const query = "SELECT id, name, description FROM roles ORDER BY id ASC";
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Błąd podczas pobierania ról:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas pobierania listy ról." });
  }
};

// Rejestracja nowego użytkownika przez Administratora
const createUser = async (req, res) => {
  const body = req.body || {};
  const firstName = normalizeText(body.firstName);
  const lastName = normalizeText(body.lastName);
  const password = normalizeText(body.password);
  const roleId = parsePositiveInteger(body.roleId);

  if (!firstName || !lastName || !password || !roleId) {
    return res
      .status(400)
      .json({ message: "Wszystkie pola formularza są wymagane." });
  }

  // Walidacja minimalnej długości hasła
  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Hasło musi zawierać co najmniej 6 znaków." });
  }

  try {
    if (!(await roleExists(roleId))) {
      return res.status(400).json({ message: "Wybrana rola nie istnieje." });
    }

    let baseUsername = generateUniqueUsername(firstName, lastName);
    let finalUsername = baseUsername;
    let counter = 1;

    while (true) {
      const checkQuery =
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL";
      const existing = await db.query(checkQuery, [finalUsername]);
      if (existing.rows.length === 0) break;
      counter++;
      finalUsername = `${baseUsername}${counter}`;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertQuery = `
      INSERT INTO users (username, first_name, last_name, password_hash, role_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, first_name, last_name, role_id, created_at
    `;
    const values = [finalUsername, firstName, lastName, passwordHash, roleId];
    const { rows } = await db.query(insertQuery, values);
    const createdRoleName = await getRoleName(rows[0].role_id);
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.roleName,
      action: "CREATE",
      entityType: "USER",
      entityId: rows[0].id,
      oldData: {},
      newData: { ...rows[0], role_name: createdRoleName },
    });

    res.status(201).json({
      message: `Użytkownik został pomyślnie zarejestrowany jako "${finalUsername}".`,
      user: rows[0],
    });
  } catch (error) {
    console.error("Błąd podczas tworzenia użytkownika:", error);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Użytkownik o takim loginie już istnieje." });
    }
    res
      .status(500)
      .json({ message: "Błąd serwera podczas rejestracji użytkownika." });
  }
};

// Edycja użytkownika
const updateUser = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const firstName = normalizeText(body.firstName);
  const lastName = normalizeText(body.lastName);
  const roleId = parsePositiveInteger(body.roleId);
  const password = normalizeText(body.password);

  if (!lastName || !roleId) {
    return res.status(400).json({ message: "Nazwisko i rola są wymagane." });
  }

  if (password && password.length < 6) {
    return res
      .status(400)
      .json({ message: "Hasło musi zawierać co najmniej 6 znaków." });
  }

  try {
    if (!(await roleExists(roleId))) {
      return res.status(400).json({ message: "Wybrana rola nie istnieje." });
    }

    const userRes = await db.query(
      "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ message: "Użytkownik nie istnieje." });
    }

    const currentUser = userRes.rows[0];
    const currentRoleName = await getRoleName(currentUser.role_id);

    if (
      String(id) === String(req.user.id) &&
      String(roleId) !== String(currentUser.role_id)
    ) {
      return res
        .status(400)
        .json({ message: "Nie możesz zmienić własnej roli administratora." });
    }

    const targetFirstName = firstName || currentUser.first_name;
    const targetLastName = lastName || currentUser.last_name;
    const roleChanged = String(roleId) !== String(currentUser.role_id);
    const targetRoleName = await getRoleName(roleId);

    // Generowanie unikalnego loginu z pominięciem samego siebie
    let baseUsername = generateUniqueUsername(targetFirstName, targetLastName);
    let finalUsername = baseUsername;
    let counter = 1;

    while (true) {
      const checkQuery =
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 AND deleted_at IS NULL";
      const existing = await db.query(checkQuery, [finalUsername, id]);
      if (existing.rows.length === 0) break;
      counter++;
      finalUsername = `${baseUsername}${counter}`;
    }

    const profileChanged =
      finalUsername !== currentUser.username ||
      targetFirstName !== currentUser.first_name ||
      targetLastName !== currentUser.last_name;
    const passwordChanged = Boolean(password);

    // Dynamiczne zapytanie SQL (obsługa opcjonalnej zmiany hasła w jednym miejscu)
    let query, values;
    if (passwordChanged) {
      const newHash = await bcrypt.hash(password, 10);
      query = `
        UPDATE users
        SET first_name = $1, last_name = $2, username = $3, role_id = $4, password_hash = $5
        WHERE id = $6
        RETURNING id, username, first_name, last_name, role_id
      `;
      values = [
        targetFirstName,
        targetLastName,
        finalUsername,
        roleId,
        newHash,
        id,
      ];
    } else {
      query = `
        UPDATE users
        SET first_name = $1, last_name = $2, username = $3, role_id = $4
        WHERE id = $5
        RETURNING id, username, first_name, last_name, role_id
      `;
      values = [targetFirstName, targetLastName, finalUsername, roleId, id];
    }

    const { rows } = await db.query(query, values);

    if (profileChanged || roleChanged || passwordChanged) {
      await logAudit({
        actorId: req.user.id,
        actorRole: req.user.roleName,
        action: roleChanged ? "USER_ROLE_CHANGED" : "UPDATE",
        entityType: "USER",
        entityId: id,
        oldData: {
          username: currentUser.username,
          first_name: currentUser.first_name,
          last_name: currentUser.last_name,
          role_id: currentUser.role_id,
          role_name: currentRoleName,
          password_changed: false,
        },
        newData: {
          username: rows[0].username,
          first_name: rows[0].first_name,
          last_name: rows[0].last_name,
          role_id: rows[0].role_id,
          role_name: targetRoleName,
          password_changed: passwordChanged,
        },
      });
    }

    return res.json({
      message: passwordChanged
        ? "Zaktualizowano dane oraz hasło użytkownika."
        : "Zaktualizowano dane użytkownika.",
      user: rows[0],
    });
  } catch (error) {
    console.error("Błąd podczas edycji użytkownika:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas edycji użytkownika." });
  }
};

// Usuwanie konta użytkownika
const deleteUser = async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user.id;

  if (String(id) === String(currentUserId)) {
    return res
      .status(400)
      .json({ message: "Nie możesz usunąć własnego konta administratora!" });
  }

  try {
    const userResult = await db.query(
      `SELECT id, username, first_name, last_name, role_id, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (userResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Nie znaleziono użytkownika o podanym ID." });
    }

    const deleteQuery = `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, username, first_name, last_name, role_id, created_at, deleted_at
    `;
    const { rows } = await db.query(deleteQuery, [id]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Nie znaleziono użytkownika o podanym ID." });
    }
    await logAudit({
      actorId: req.user.id,
      actorRole: req.user.roleName,
      action: "DELETE",
      entityType: "USER",
      entityId: id,
      oldData: {
        ...userResult.rows[0],
        role_name: await getRoleName(userResult.rows[0].role_id),
      },
      newData: {},
    });

    res.json({ message: "Użytkownik został pomyślnie usunięty." });
  } catch (error) {
    console.error("Błąd podczas usuwania użytkownika:", error);
    res
      .status(500)
      .json({ message: "Błąd serwera podczas usuwania użytkownika." });
  }
};

module.exports = {
  getAllUsers,
  getRoles,
  createUser,
  updateUser,
  deleteUser,
};
