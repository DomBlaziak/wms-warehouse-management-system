import React from "react";
import "../styles/navbar.css";

const Navbar = ({ user, onLogout, activeTab, setActiveTab }) => {
  if (!user) return null;

  const roleName = user.roleName || user.role_name || "Użytkownik";
  const canViewAnalytics =
    roleName === "Kierownik" || roleName === "Administrator";

  return (
    <nav className="navbar navbar-expand-lg navbar-dark custom-navbar shadow-sm px-4">
      <div className="container-fluid">
        <span className="navbar-brand d-flex align-items-center gap-2 fw-bold me-4 text-white">
          <img
            src="/favicon.ico"
            alt="SmartInventory logo"
            style={{ width: "28px", height: "28px", objectFit: "contain" }}
          />
          <span>SmartInventory</span>
        </span>

        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 gap-2">
            <li className="nav-item">
              <button
                className={`btn nav-link-btn ${activeTab === "dashboard" ? "active-tab" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                Panel Główny
              </button>
            </li>

            {canViewAnalytics && (
              <li className="nav-item">
                <button
                  className={`btn nav-link-btn ${activeTab === "analytics" ? "active-tab" : ""}`}
                  onClick={() => setActiveTab("analytics")}
                >
                  Statystyki
                </button>
              </li>
            )}

            {canViewAnalytics && (
              <li className="nav-item">
                <button
                  className={`btn nav-link-btn ${activeTab === "wms-analytics" ? "active-tab" : ""}`}
                  onClick={() => setActiveTab("wms-analytics")}
                >
                  Analityka WMS
                </button>
              </li>
            )}

            {roleName === "Administrator" && (
              <>
                <li className="nav-item">
                  <button
                    className={`btn nav-link-btn ${activeTab === "categories" ? "active-tab" : ""}`}
                    onClick={() => setActiveTab("categories")}
                  >
                    Kategorie
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`btn nav-link-btn ${activeTab === "admin" ? "active-tab" : ""}`}
                    onClick={() => setActiveTab("admin")}
                  >
                    Użytkownicy
                  </button>
                </li>
              </>
            )}
          </ul>

          <div className="d-flex align-items-center gap-3">
            <div className="text-white text-end me-2">
              <small
                className="d-block text-white-50"
                style={{ fontSize: "0.75rem" }}
              >
                Zalogowany jako:
              </small>
              <span className="fw-semibold me-2">
                {user.username ||
                  `${user.firstName || ""} ${user.lastName || ""}`}
              </span>
              <span
                className={`badge ${roleName === "Administrator" ? "bg-danger" : roleName === "Kierownik" ? "bg-warning text-dark" : "bg-info text-dark"}`}
              >
                {roleName}
              </span>
            </div>
            <button
              className="btn btn-outline-light btn-sm px-3"
              onClick={onLogout}
            >
              Wyloguj się
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
