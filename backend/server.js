const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const { isDatabaseAvailable } = require("./config/db");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: isDatabaseAvailable() ? "connected" : "disconnected",
  });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/movements", require("./routes/movementRoutes"));
app.use("/api/audit", require("./routes/auditRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Nieprawidłowy format JSON." });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Przesłane dane są zbyt duże." });
  }

  console.error("Nieobsłużony błąd serwera:", err);
  res.status(500).json({ message: "Wewnętrzny błąd serwera." });
});

const startServer = (port = process.env.PORT || 5000) => {
  return app.listen(port, () => {
    console.log(`Serwer Express.js uruchomiony na porcie ${port}`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
