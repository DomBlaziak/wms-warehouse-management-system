const { Pool } = require("pg");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

const pool = new Pool(config);
let databaseConnected = false;

const checkDatabaseConnection = async () => {
  try {
    const client = await pool.connect();
    client.release();
    databaseConnected = true;
    console.log("Połączono pomyślnie z bazą danych PostgreSQL!");
    return true;
  } catch (error) {
    databaseConnected = false;
    console.warn(
      "PostgreSQL jest niedostępne. Serwer będzie działał w trybie ograniczonym, a endpointy wymagające bazy zwrócą błąd w czasie wykonywania.",
    );
    console.warn(error.message || "Brak połączenia z bazą danych.");
    return false;
  }
};

checkDatabaseConnection();

pool.on("error", (error) => {
  databaseConnected = false;
  console.warn("Utracono połączenie z bazą danych PostgreSQL:", error.message);
});

const query = async (text, params) => {
  if (!databaseConnected) {
    const connected = await checkDatabaseConnection();
    if (!connected) {
      const dbError = new Error(
        "Baza danych PostgreSQL jest niedostępna. Sprawdź konfigurację .env i połączenie z serwerem DB.",
      );
      dbError.code = "DB_UNAVAILABLE";
      throw dbError;
    }
  }

  return pool.query(text, params);
};

module.exports = {
  pool,
  query,
  isDatabaseAvailable: () => databaseConnected,
  checkDatabaseConnection,
};
