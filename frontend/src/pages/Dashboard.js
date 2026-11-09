import React, { useState, useEffect, useMemo } from "react";
import API from "../api/axios";
import AuditDetailsModal from "../components/AuditDetailsModal";
import ProductDetailsModal from "../components/ProductDetailsModal";
import ProductModal from "../components/ProductModal";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import ExportPdfModal from "../components/ExportPdfModal";
import MovementModal from "../components/MovementModal";
import "../styles/dashboard.css";

const DEFAULT_CATEGORIES = [
  { id: 1, name: "Laptopy" },
  { id: 2, name: "Jednostki centralne" },
  { id: 3, name: "Akcesoria" },
];

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getLocalDateKey = (value) => getLocalDateString(new Date(value));

const getWeekRange = (weekOffset) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(
    now.getDate() -
      (now.getDay() === 0 ? 6 : now.getDay() - 1) +
      weekOffset * 7,
  );
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const formatAuditLabel = (value, mode) => {
  const date = new Date(value);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (mode === "day") return `[${time}]`;
  return `[${date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}, ${time}]`;
};

const countChangedAuditFields = (log) => {
  const oldData = log.old_data || {};
  const newData = log.new_data || {};
  const ignored = new Set(["id", "created_at", "updated_at", "role_id"]);
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  let count = 0;

  keys.forEach((key) => {
    if (ignored.has(key)) return;
    if (key === "attributes") {
      const oldAttributes = oldData.attributes || {};
      const newAttributes = newData.attributes || {};
      const attributeKeys = new Set([
        ...Object.keys(oldAttributes),
        ...Object.keys(newAttributes),
      ]);
      attributeKeys.forEach((attributeKey) => {
        if (
          JSON.stringify(oldAttributes[attributeKey]) !==
          JSON.stringify(newAttributes[attributeKey])
        ) {
          count += 1;
        }
      });
      return;
    }
    if (
      JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]) &&
      key !== "required_attributes"
    ) {
      count += 1;
    }
  });

  if (log.entity_type === "CATEGORY") {
    const oldFields = oldData.required_attributes || [];
    const newFields = newData.required_attributes || [];
    const fieldKeys = new Set([
      ...oldFields.map((field) => field?.key).filter(Boolean),
      ...newFields.map((field) => field?.key).filter(Boolean),
    ]);
    fieldKeys.forEach((key) => {
      const oldField = oldFields.find((field) => field?.key === key);
      const newField = newFields.find((field) => field?.key === key);
      if (JSON.stringify(oldField) !== JSON.stringify(newField)) count += 1;
    });
  }

  return count;
};

const getAuditSummary = (log) => {
  const username = log.username || "Pracownik";
  const entityName =
    log.current_product_name ||
    log.new_data?.name ||
    log.old_data?.name ||
    log.new_data?.username ||
    log.old_data?.username ||
    "obiekt";

  const entityLabels = {
    PRODUCT: "produkt",
    CATEGORY: "kategorię",
    USER: "użytkownika",
  };
  const entityLabel = entityLabels[log.entity_type] || "obiekt";

  if (log.action === "USER_ROLE_CHANGED") {
    return (
      <span>
        <strong>{username}</strong> zmienił rolę użytkownika{" "}
        <span className="text-primary fw-semibold">{entityName}</span>
      </span>
    );
  }

  if (log.action === "CREATE" && log.entity_type === "USER") {
    return (
      <span>
        <strong>{username}</strong> utworzył konto użytkownika{" "}
        <span className="text-success fw-bold">{entityName}</span>
      </span>
    );
  }

  if (log.action === "CREATE") {
    return (
      <span>
        <strong>{username}</strong> utworzył {entityLabel}{" "}
        <span className="text-success fw-bold">{entityName}</span>
      </span>
    );
  }

  if (log.action === "DELETE") {
    return (
      <span>
        <strong>{username}</strong> usunął {entityLabel}{" "}
        <span className="text-danger fw-bold">{entityName}</span>
      </span>
    );
  }

  if (log.action === "UPDATE") {
    const changedFields = countChangedAuditFields(log);

    return (
      <span>
        <strong>{username}</strong> zaktualizował {entityLabel}:{" "}
        <span className="text-primary fw-semibold">{entityName}</span> (
        {changedFields} {changedFields === 1 ? "pole" : "pól"})
      </span>
    );
  }

  return (
    <span>
      <strong>{username}</strong> wykonał akcję w systemie
    </span>
  );
};

const getAuditItemClasses = (action) => {
  switch (action) {
    case "CREATE":
      return "bg-success bg-opacity-10 border-start border-4 border-success";
    case "UPDATE":
      return "bg-primary bg-opacity-10 border-start border-4 border-primary";
    case "USER_ROLE_CHANGED":
      return "bg-warning bg-opacity-10 border-start border-4 border-warning";
    case "DELETE":
      return "bg-danger bg-opacity-10 border-start border-4 border-danger";
    default:
      return "bg-light border-start border-4 border-secondary";
  }
};

const Dashboard = ({ user }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [movements, setMovements] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Bezpieczne pobranie dzisiejszej daty w czasie lokalnym (YYYY-MM-DD)
  const todayStr = getLocalDateString();
  const currentMonthStr = todayStr.slice(0, 7);

  const [auditViewMode, setAuditViewMode] = useState("day");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [weekOffset, setWeekOffset] = useState(0);

  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [selectedProductForDetails, setSelectedProductForDetails] =
    useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  const [movementModalData, setMovementModalData] = useState({
    isOpen: false,
    product: null,
    type: "IN",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notification, setNotification] = useState("");

  const roleName = user?.roleName || user?.role_name || "Użytkownik";
  const isAdmin = roleName === "Administrator";
  const isManager = roleName === "Kierownik";
  const isWarehouseman = roleName === "Magazynier";

  // Precyzyjne uprawnienia RBAC
  const canManageProducts = isManager; // Tylko Kierownik dodaje i edytuje produkty
  const canDelete = isManager; // Tylko Kierownik usuwa produkty
  const canOperateStock = isManager || isWarehouseman; // PZ i WZ: Magazynier i Kierownik

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async ({ showLoading = true } = {}) => {
    try {
      setError("");
      if (showLoading) setLoading(true);
      const [prodRes, auditRes, catRes, movRes] = await Promise.all([
        API.get("/products"),
        API.get("/audit"),
        API.get("/categories"),
        API.get("/movements"),
      ]);

      setProducts(prodRes.data || []);
      setAuditLogs(auditRes.data || []);
      setCategories(catRes.data || DEFAULT_CATEGORIES);
      setMovements(movRes.data || []);
    } catch (err) {
      console.error("Błąd podczas pobierania danych:", err);
      setError("Nie udało się pobrać danych z serwera.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMovement = (product, type) => {
    setMovementModalData({
      isOpen: true,
      product,
      type,
    });
  };

  const handleSaveMovement = async (type, payload) => {
    const endpoint = type === "IN" ? "/movements/in" : "/movements/out";
    await API.post(endpoint, payload);
    setMovementModalData({ isOpen: false, product: null, type: "IN" });
    await fetchDashboardData({ showLoading: false });
  };

  const handleSaveProduct = async (productData) => {
    setNotification("");

    if (productToEdit) {
      await API.put(`/products/${productToEdit.id}`, productData);
    } else {
      await API.post("/products", productData);
    }

    setShowProductModal(false);
    setProductToEdit(null);
    await fetchDashboardData();
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await API.delete(`/products/${productToDelete.id}`);
      setProductToDelete(null);
      fetchDashboardData();
    } catch (err) {
      setNotification(
        err.response?.data?.message || "Błąd podczas usuwania produktu.",
      );
      setProductToDelete(null);
    }
  };

  const filteredProducts = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return products.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const code = (p.product_code || "").toLowerCase();
      return name.includes(query) || code.includes(query);
    });
  }, [products, searchTerm]);

  const { start: weekStart, end: weekEnd } = useMemo(
    () => getWeekRange(weekOffset),
    [weekOffset],
  );

  const weekLabel = useMemo(
    () =>
      `${weekStart.toLocaleDateString("pl-PL")} – ${weekEnd.toLocaleDateString("pl-PL")}`,
    [weekEnd, weekStart],
  );

  const visibleAuditLogs = useMemo(() => {
    return auditLogs;
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    return visibleAuditLogs.filter((log) => {
      const logDate = new Date(log.changed_at);
      if (auditViewMode === "day") {
        return getLocalDateKey(logDate) === selectedDate;
      }
      if (auditViewMode === "week") {
        return logDate >= weekStart && logDate <= weekEnd;
      }
      if (auditViewMode === "month") {
        return getLocalDateKey(logDate).slice(0, 7) === selectedMonth;
      }
      return true;
    });
  }, [
    auditViewMode,
    selectedDate,
    selectedMonth,
    weekEnd,
    weekStart,
    visibleAuditLogs,
  ]);

  const shiftDay = (delta) => {
    // Rozbijamy aktualnie wybraną datę (np. "2026-10-26") na liczby
    const [year, month, day] = selectedDate.split("-").map(Number);

    // Tworzymy nową datę lokalną (miesiące w JS od 0 do 11)
    const d = new Date(year, month - 1, day + delta);

    // Składamy z powrotem do formatu YYYY-MM-DD
    const nextYear = d.getFullYear();
    const nextMonth = String(d.getMonth() + 1).padStart(2, "0");
    const nextDay = String(d.getDate()).padStart(2, "0");

    const next = `${nextYear}-${nextMonth}-${nextDay}`;
    setSelectedDate(next > todayStr ? todayStr : next);
  };

  const shiftMonth = (delta) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(next > currentMonthStr ? currentMonthStr : next);
  };

  return (
    <div className="container-fluid py-4 px-4">
      {error && <div className="alert alert-danger">{error}</div>}
      {notification && (
        <div
          className="alert alert-warning alert-dismissible fade show"
          role="alert"
        >
          {notification}
          <button
            type="button"
            className="btn-close"
            aria-label="Zamknij komunikat"
            onClick={() => setNotification("")}
          />
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card p-3 shadow-sm border-0">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="fw-bold mb-0">Produkty w systemie</h4>
              <div className="input-group" style={{ maxWidth: "280px" }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Znajdź produkt..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className="btn btn-outline-secondary" type="button">
                  <i className="bi bi-search"></i>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4 text-muted">
                Ładowanie danych z bazy PostgreSQL...
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Produkt</th>
                      <th>Kod SKU</th>
                      <th>Stan</th>
                      <th>Cena sprzedaży (zł)</th>
                      <th className="text-end">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-muted py-3">
                          Brak produktów spełniających kryteria.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr key={p.id}>
                          <td className="fw-semibold">{p.name}</td>
                          <td>
                            <span className="badge bg-light text-dark border">
                              {p.product_code}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${p.quantity <= 3 ? "bg-danger" : "bg-secondary"}`}
                            >
                              {p.quantity} szt.
                            </span>
                          </td>
                          <td>
                            {Number(p.selling_price ?? p.price ?? 0).toFixed(2)}{" "}
                            zł
                          </td>
                          <td className="text-end text-nowrap">
                            <button
                              className="btn btn-sm btn-outline-success me-2 fw-semibold"
                              disabled={!canOperateStock}
                              onClick={() => handleOpenMovement(p, "IN")}
                              title={
                                isAdmin
                                  ? "Administrator posiada profil audytowy"
                                  : "Zarejestruj przyjęcie na magazyn (PZ)"
                              }
                            >
                              <i className="bi bi-box-arrow-in-down me-1"></i>{" "}
                              PZ
                            </button>

                            <button
                              className="btn btn-sm btn-outline-warning me-3 fw-semibold text-dark"
                              disabled={!canOperateStock || p.quantity === 0}
                              onClick={() => handleOpenMovement(p, "OUT")}
                              title={
                                isAdmin
                                  ? "Administrator posiada profil audytowy"
                                  : p.quantity === 0
                                    ? "Brak towaru na stanie"
                                    : "Zarejestruj wydanie z magazynu (WZ)"
                              }
                            >
                              <i className="bi bi-box-arrow-up me-1"></i> WZ
                            </button>

                            <button
                              className="btn btn-sm btn-outline-info me-2 text-dark"
                              onClick={() => setSelectedProductForDetails(p)}
                              title="Pokaż szczegóły i specyfikację"
                            >
                              <i className="bi bi-eye"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary me-2"
                              disabled={!canManageProducts}
                              onClick={() => {
                                setProductToEdit(p);
                                setShowProductModal(true);
                              }}
                              title={
                                !canManageProducts
                                  ? "Tylko Kierownik może edytować kartotekę produktu"
                                  : "Edytuj dane sprzętu"
                              }
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              disabled={!canDelete}
                              onClick={() => setProductToDelete(p)}
                              title={
                                !canDelete
                                  ? "Tylko Kierownik może usuwać produkty"
                                  : "Usuń bezpowrotnie"
                              }
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="d-flex justify-content-between align-items-center mt-3">
              <button
                className="btn btn-secondary btn-sm px-3 shadow-sm"
                disabled={isAdmin}
                onClick={() => setShowPdfModal(true)}
                title={
                  isAdmin
                    ? "Administrator posiada profil audytowy - brak uprawnień do generowania raportów PDF"
                    : "Generuj raport PDF"
                }
              >
                <i className="bi bi-file-pdf me-1"></i> Generuj PDF
              </button>

              <button
                className="btn btn-primary shadow-sm fw-bold"
                disabled={!canManageProducts}
                onClick={() => {
                  setProductToEdit(null);
                  setShowProductModal(true);
                }}
                title={
                  !canManageProducts
                    ? "Tylko Kierownik może dodawać nowe produkty"
                    : "Dodaj nowy produkt"
                }
              >
                + Dodaj nowy produkt
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card p-3 shadow-sm border-0 h-100">
            <h5 className="fw-bold text-center mb-3">Rejestr operacji</h5>

            <div className="btn-group w-100 mb-2" role="group">
              <button
                type="button"
                className={`btn btn-sm ${auditViewMode === "day" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setAuditViewMode("day")}
              >
                Dzień
              </button>
              <button
                type="button"
                className={`btn btn-sm ${auditViewMode === "week" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setAuditViewMode("week")}
              >
                Tydzień
              </button>
              <button
                type="button"
                className={`btn btn-sm ${auditViewMode === "month" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setAuditViewMode("month")}
              >
                Miesiąc
              </button>
            </div>

            <div className="p-2 bg-light rounded mb-3 text-center">
              {auditViewMode === "day" && (
                <div>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      onClick={() => shiftDay(-1)}
                    >
                      &laquo; Poprzedni
                    </button>
                    <small className="fw-bold">{selectedDate}</small>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      disabled={selectedDate >= todayStr}
                      onClick={() => shiftDay(1)}
                    >
                      Następny &raquo;
                    </button>
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                    Wybrany dzień: {selectedDate}
                  </div>
                </div>
              )}
              {auditViewMode === "week" && (
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      onClick={() => setWeekOffset((prev) => prev - 1)}
                    >
                      &laquo; Poprzedni
                    </button>
                    <small className="fw-bold">
                      {weekOffset === 0
                        ? "Bieżący tydzień"
                        : `${Math.abs(weekOffset)} tyg. ${weekOffset < 0 ? "temu" : "przyszły"}`}
                    </small>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      disabled={weekOffset >= 0}
                      onClick={() => setWeekOffset((prev) => prev + 1)}
                    >
                      Następny &raquo;
                    </button>
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                    Zakres: {weekLabel}
                  </div>
                </div>
              )}
              {auditViewMode === "month" && (
                <div>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      onClick={() => shiftMonth(-1)}
                    >
                      &laquo; Poprzedni
                    </button>
                    <small className="fw-bold text-capitalize">
                      {new Date(
                        `${selectedMonth}-01T00:00:00`,
                      ).toLocaleDateString("pl-PL", {
                        month: "long",
                        year: "numeric",
                      })}
                    </small>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                      disabled={selectedMonth >= currentMonthStr}
                      onClick={() => shiftMonth(1)}
                    >
                      Następny &raquo;
                    </button>
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                    Miesiąc rozliczeniowy: {selectedMonth}
                  </div>
                </div>
              )}
            </div>

            <div
              className="audit-feed"
              style={{ maxHeight: "420px", overflowY: "auto" }}
            >
              {filteredAuditLogs.length === 0 ? (
                <p className="text-muted text-center small py-3">
                  Brak operacji w wybranym okresie.
                </p>
              ) : (
                filteredAuditLogs.map((log) => {
                  const isDelete = log.action === "DELETE";

                  return (
                    <div
                      key={log.id}
                      className={`audit-item mb-2 p-2 rounded shadow-sm ${getAuditItemClasses(log.action)}`}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <small className="text-muted fw-bold">
                          {formatAuditLabel(log.changed_at, auditViewMode)}
                        </small>

                        {!isDelete && (
                          <button
                            className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => setSelectedAuditLog(log)}
                          >
                            Szczegóły
                          </button>
                        )}
                      </div>
                      <div className="small">{getAuditSummary(log)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <ProductDetailsModal
        product={selectedProductForDetails}
        categories={categories}
        onClose={() => setSelectedProductForDetails(null)}
      />

      <AuditDetailsModal
        auditLog={selectedAuditLog}
        categories={categories}
        onClose={() => setSelectedAuditLog(null)}
      />

      {showProductModal && (
        <ProductModal
          productToEdit={productToEdit}
          categories={categories}
          existingProducts={products}
          currentUser={user}
          onSave={handleSaveProduct}
          onClose={() => {
            setShowProductModal(false);
            setProductToEdit(null);
          }}
        />
      )}

      {movementModalData.isOpen && (
        <MovementModal
          product={movementModalData.product}
          movementType={movementModalData.type}
          onSave={handleSaveMovement}
          onClose={() =>
            setMovementModalData({ isOpen: false, product: null, type: "IN" })
          }
        />
      )}

      {productToDelete && (
        <ConfirmDeleteModal
          title="Usunięcie Zasobu IT"
          itemText={`${productToDelete.name} (${productToDelete.product_code})`}
          onConfirm={handleConfirmDeleteProduct}
          onCancel={() => setProductToDelete(null)}
        />
      )}

      {showPdfModal && (
        <ExportPdfModal
          products={products}
          categories={categories}
          movements={movements}
          currentUser={user}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
