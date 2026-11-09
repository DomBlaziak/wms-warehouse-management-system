import React, { useState } from "react";
import API from "../api/axios";
import "../styles/login.css";

const Login = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Stany dla modalu resetu
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetStatus, setResetStatus] = useState({ type: "", text: "" });

  const openForgotModal = () => {
    setShowForgotModal(true);
    setResetStatus({ type: "", text: "" });
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setResetUsername("");
    setResetStatus({ type: "", text: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await API.post("/auth/login", { username, password });

      if (response.data && response.data.user) {
        localStorage.setItem("user", JSON.stringify(response.data.user));
        onLoginSuccess(response.data.user);
      }
    } catch (err) {
      console.error("Błąd logowania:", err);
      setError(err.response?.data?.message || "Nieprawidłowy login lub hasło.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetRequest = async (e) => {
    e.preventDefault();
    setResetStatus({ type: "", text: "" });

    if (!resetUsername.trim()) {
      setResetStatus({
        type: "danger",
        text: "Proszę podać login użytkownika.",
      });
      return;
    }

    try {
      const res = await API.post("/auth/reset-request", {
        username: resetUsername.trim(),
      });
      setResetStatus({
        type: "success",
        text:
          res.data?.message ||
          `Zgłoszenie dla loginu "${resetUsername}" zostało zarejestrowane.`,
      });
      setResetUsername("");
    } catch (err) {
      setResetStatus({
        type: "danger",
        text:
          err.response?.data?.message ||
          "Nie udało się przetworzyć zgłoszenia. Spróbuj ponownie za chwilę.",
      });
    }
  };

  return (
    <div className="login-page">
      {/* Niebieski pasek nagłówkowy */}
      <div className="login-header text-white py-3 px-4 shadow-sm d-flex align-items-center gap-2">
        <i className="bi bi-box-seam fs-3"></i>
        <span className="fs-3 fw-bold">SmartInventory</span>
      </div>

      {/* Formularz logowania */}
      <div className="container d-flex justify-content-center align-items-center flex-grow-1 my-5">
        <div
          className="card login-card p-4 shadow-sm"
          style={{ maxWidth: "420px", width: "100%" }}
        >
          <h3 className="text-center fw-bold mb-4">Zaloguj się do systemu</h3>

          {error && <div className="alert alert-danger py-2">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="mb-3 text-start">
              <label className="form-label fw-semibold">Login</label>
              <input
                type="text"
                className="form-control"
                placeholder="Wpisz swój login (np. j.kowalski)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="mb-4 text-start">
              <label className="form-label fw-semibold">Hasło</label>
              <input
                type="password"
                className="form-control"
                placeholder="Wpisz swoje hasło"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 fw-semibold mb-2"
              disabled={loading}
            >
              {loading ? "Logowanie..." : "Zaloguj się"}
            </button>
          </form>

          {/* Przycisk "Zapomniałeś hasła?" */}
          <div className="text-center mt-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm px-3"
              onClick={openForgotModal}
            >
              Zapomniałeś hasła?
            </button>
          </div>
        </div>
      </div>

      {/* Okno Modalne ze zgłoszeniem resetu hasła po podaniu loginu */}
      {showForgotModal && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-key me-2"></i>
                  Zgłoszenie Resetu Hasła
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeForgotModal}
                ></button>
              </div>

              <form onSubmit={handleSendResetRequest}>
                <div className="modal-body p-4 text-start">
                  {resetStatus.text ? (
                    <div className={`alert alert-${resetStatus.type} mb-0`}>
                      {resetStatus.text}
                    </div>
                  ) : (
                    <>
                      <p className="small text-muted mb-3">
                        Wpisz swój login w systemie SmartInventory. Zgłoszenie
                        zostanie wysłane do Administratora, który przygotuje dla
                        Ciebie nowe hasło.
                      </p>
                      <div className="mb-3">
                        <label className="form-label small fw-bold">
                          Twój Login Systemowy
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="np. j.kowalski"
                          value={resetUsername}
                          onChange={(e) => setResetUsername(e.target.value)}
                          required
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeForgotModal}
                  >
                    Zamknij
                  </button>
                  {resetStatus.type !== "success" && (
                    <button
                      type="submit"
                      className="btn btn-primary fw-bold px-4"
                    >
                      Wyślij zgłoszenie
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
