import React, { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import GeneralStats from "./pages/GeneralStats";
import WmsAnalytics from "./pages/WmsAnalytics";
import CategoryManager from "./pages/CategoryManager";
import Admin from "./pages/Admin";
import API from "./api/axios";
import "./styles/global.css";

const loadStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    const savedUser = loadStoredUser();
    if (savedUser) {
      setUser(savedUser);
    }

    const handleSessionExpired = () => {
      setUser(null);
    };

    window.addEventListener("auth:expired", handleSessionExpired);
    return () =>
      window.removeEventListener("auth:expired", handleSessionExpired);
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveTab("dashboard");
  };

  const handleLogout = async () => {
    try {
      await API.post("/auth/logout");
    } catch (err) {
      console.error("Błąd podczas wylogowywania:", err);
    } finally {
      localStorage.removeItem("user");
      setUser(null);
    }
  };

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const roleName = user?.roleName || user?.role_name || "Użytkownik";
  const isAdmin = roleName === "Administrator";
  const canViewAnalytics =
    roleName === "Kierownik" || roleName === "Administrator";

  return (
    <div className="app-container">
      <Navbar
        user={user}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="content">
        {activeTab === "dashboard" && (
          <Dashboard user={user} setActiveTab={setActiveTab} />
        )}
        {activeTab === "analytics" && canViewAnalytics && <GeneralStats />}
        {activeTab === "wms-analytics" && canViewAnalytics && <WmsAnalytics />}
        {activeTab === "categories" && isAdmin && <CategoryManager />}
        {activeTab === "admin" && isAdmin && <Admin user={user} />}
      </main>
    </div>
  );
}

export default App;
