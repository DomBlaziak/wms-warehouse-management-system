import React, { useState, useEffect, useMemo, useRef } from "react";
import API from "../api/axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import "../styles/dashboard.css";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTodayStr = () => formatLocalDate(new Date());
const getDefaultPastStr = (days = 30) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatLocalDate(d);
};

const compareNewestMovements = (a, b) => {
  const dateDifference =
    parseLocalDate(b.movement_date || b.created_at) -
    parseLocalDate(a.movement_date || a.created_at);
  if (dateDifference !== 0) return dateDifference;

  const createdDifference =
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  if (createdDifference !== 0) return createdDifference;

  return String(b.id).localeCompare(String(a.id));
};

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getProductLabel = (product) =>
  product
    ? `${product.name || "Produkt bez nazwy"} (${product.product_code || "bez SKU"})`
    : "";

const PRODUCT_RESULTS_LIMIT = 50;

const ProductSearchSelect = ({ products, value, onChange }) => {
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => String(product.id) === String(value)),
    [products, value],
  );

  // Synchronizacja tekstu w inpucie z aktualnie wybranym produktem z zewnątrz
  useEffect(() => {
    if (!isOpen) {
      setQuery(getProductLabel(selectedProduct));
    }
  }, [selectedProduct, isOpen]);

  // Automatyczne zamykanie listy po kliknięciu poza komponentem
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setQuery(getProductLabel(selectedProduct));
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  const matchingProducts = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const selectedProductLabel = getProductLabel(selectedProduct);
    if (!normalizedQuery || (isOpen && query === selectedProductLabel)) {
      return products;
    }

    return products.filter((product) => {
      const name = normalizeSearchText(product.name);
      const sku = normalizeSearchText(product.product_code);
      return name.includes(normalizedQuery) || sku.includes(normalizedQuery);
    });
  }, [products, query, selectedProduct, isOpen]);

  const visibleProducts = matchingProducts.slice(0, PRODUCT_RESULTS_LIMIT);

  const selectProduct = (product) => {
    setQuery(getProductLabel(product));
    setIsOpen(false);
    onChange(String(product.id));
  };

  return (
    <div className="wms-product-search" ref={containerRef}>
      <div className="wms-product-search__control">
        <i
          className="bi bi-search wms-product-search__icon"
          aria-hidden="true"
        ></i>
        <input
          type="search"
          className="form-control form-control-sm shadow-sm wms-product-search__input"
          value={query}
          placeholder="Wybierz produkt — wpisz nazwę lub SKU"
          autoComplete="off"
          disabled={products.length === 0}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
        />
        {query && (
          <button
            type="button"
            className="wms-product-search__clear"
            aria-label="Wyczyść wyszukiwanie produktu"
            title="Wyczyść wyszukiwanie"
            onClick={() => {
              setQuery("");
              setIsOpen(true);
            }}
          >
            <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="wms-product-search__menu" role="listbox">
          {visibleProducts.length > 0 ? (
            <>
              {visibleProducts.map((product) => (
                <div
                  key={product.id}
                  role="option"
                  aria-selected={String(product.id) === String(value)}
                  className={`wms-product-search__option ${
                    String(product.id) === String(value) ? "is-selected" : ""
                  }`}
                  onClick={() => selectProduct(product)}
                >
                  <span className="wms-product-search__name">
                    {product.name}
                  </span>
                  <span className="wms-product-search__sku">
                    {product.product_code || "brak"}
                  </span>
                </div>
              ))}
              {matchingProducts.length > PRODUCT_RESULTS_LIMIT && (
                <div className="wms-product-search__more">
                  Pokazano pierwsze {PRODUCT_RESULTS_LIMIT} z{" "}
                  {matchingProducts.length} wyników. Doprecyzuj wyszukiwanie.
                </div>
              )}
            </>
          ) : (
            <div className="wms-product-search__empty">
              Nie znaleziono produktu o takiej nazwie ani SKU.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WmsAnalytics = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [movements, setMovements] = useState([]);

  const [timeRange, setTimeRange] = useState("30");
  const [customStartDate, setCustomStartDate] = useState(getDefaultPastStr(30));
  const [customEndDate, setCustomEndDate] = useState(getTodayStr());

  const [scopeType, setScopeType] = useState("CATEGORY");
  const [scopeId, setScopeId] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [prodRes, catRes, movRes] = await Promise.all([
          API.get("/products"),
          API.get("/categories"),
          API.get("/movements"),
        ]);
        const fetchedCats = catRes.data || [];
        setProducts(prodRes.data || []);
        setCategories(fetchedCats);
        setMovements(movRes.data || []);

        if (fetchedCats.length > 0 && !scopeId) {
          setScopeId(String(fetchedCats[0].id));
        }
      } catch (err) {
        setError("Nie udało się pobrać danych operacyjnych WMS.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopedProducts = useMemo(() => {
    if (!scopeId) return [];
    if (scopeType === "CATEGORY") {
      return products.filter((p) => String(p.category_id) === String(scopeId));
    }
    return products.filter((p) => String(p.id) === String(scopeId));
  }, [products, scopeType, scopeId]);

  const scopedProductIds = useMemo(
    () => new Set(scopedProducts.map((p) => String(p.id))),
    [scopedProducts],
  );

  const activeDaysCount = useMemo(() => {
    if (timeRange === "custom") {
      const start = parseLocalDate(customStartDate || getDefaultPastStr(30));
      const end = parseLocalDate(customEndDate || getTodayStr());
      if (!start || !end || end < start) return 1;
      const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      return diffDays > 0 ? diffDays : 1;
    }
    const num = Number(timeRange);
    return num === 9999 ? null : Math.max(1, num);
  }, [timeRange, customStartDate, customEndDate]);

  const timeRangeLabel = useMemo(() => {
    if (timeRange === "7") return "ostatnie 7 dni";
    if (timeRange === "30") return "ostatnie 30 dni";
    if (timeRange === "90") return "ostatnie 90 dni";
    if (timeRange === "180") return "ostatnie pół roku";
    if (timeRange === "9999") return "całą historię";
    if (timeRange === "custom") {
      return `zakres od ${customStartDate} do ${customEndDate}`;
    }
    return `ostatnie ${timeRange} dni`;
  }, [timeRange, customStartDate, customEndDate]);

  const filteredMovements = useMemo(() => {
    let cutoffDate = null;
    let endDateObj = null;
    const isFullHistory = Number(timeRange) === 9999;

    if (timeRange === "custom") {
      cutoffDate = parseLocalDate(customStartDate || getDefaultPastStr(30));
      endDateObj = parseLocalDate(customEndDate || getTodayStr());
      if (!cutoffDate || !endDateObj || endDateObj < cutoffDate) {
        return [];
      }
      cutoffDate.setHours(0, 0, 0, 0);
      endDateObj.setHours(23, 59, 59, 999);
    } else if (!isFullHistory) {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Number(timeRange));
      cutoffDate.setHours(0, 0, 0, 0);
    }

    return movements.filter((m) => {
      const mDate = parseLocalDate(m.movement_date || m.created_at);
      if (!mDate) return false;
      const isScopeValid = scopedProductIds.has(String(m.product_id));

      if (!isScopeValid) return false;
      if (isFullHistory) return true;

      if (timeRange === "custom") {
        if (cutoffDate && mDate < cutoffDate) return false;
        if (endDateObj && mDate > endDateObj) return false;
        return true;
      }

      return mDate >= cutoffDate;
    });
  }, [movements, timeRange, customStartDate, customEndDate, scopedProductIds]);

  const allInMovementsByProduct = useMemo(() => {
    const result = new Map();
    movements.forEach((movement) => {
      if (movement.movement_type !== "IN") return;
      const productId = String(movement.product_id);
      const productMovements = result.get(productId) || [];
      productMovements.push(movement);
      result.set(productId, productMovements);
    });
    result.forEach((productMovements) => {
      productMovements.sort(compareNewestMovements);
    });
    return result;
  }, [movements]);

  const analytics = useMemo(() => {
    const now = new Date();
    let totalStock = 0;
    let categoryBudget = 0;
    let categoryItemsToOrder = 0;
    let outOfStockCount = 0;
    let stockoutRisks = [];
    let priceDeviations = [];
    let totalDailyBurnRate = 0;

    scopedProducts.forEach((product) => {
      const qty = Number(product.quantity || 0);
      totalStock += qty;
      if (qty <= 0) outOfStockCount++;

      const pMovements = filteredMovements.filter(
        (m) => String(m.product_id) === String(product.id),
      );
      const inMovs = pMovements
        .filter((m) => m.movement_type === "IN")
        .sort(compareNewestMovements);
      const allProductInMovs =
        allInMovementsByProduct.get(String(product.id)) || [];
      const outMovs = pMovements.filter((m) => m.movement_type === "OUT");

      const totalIssued = outMovs.reduce(
        (sum, m) => sum + Number(m.quantity || 0),
        0,
      );
      const productCreatedAt = parseLocalDate(product.created_at);
      const productAgeDays = productCreatedAt
        ? Math.floor((now - productCreatedAt) / (1000 * 60 * 60 * 24))
        : 1;
      const daysDivisor =
        activeDaysCount === null
          ? Math.max(1, productAgeDays)
          : Math.max(1, Math.min(activeDaysCount, Math.max(1, productAgeDays)));
      const dailyBurnRate = totalIssued / daysDivisor;
      totalDailyBurnRate += dailyBurnRate;

      let daysRemaining = null;
      let stockoutDate = null;
      if (dailyBurnRate > 0 || qty <= 0) {
        daysRemaining = Math.floor(qty / dailyBurnRate);
        if (!Number.isFinite(daysRemaining)) daysRemaining = 0;
        stockoutDate = new Date(
          now.getTime() + daysRemaining * 24 * 60 * 60 * 1000,
        );
      }

      const safetyStock = Math.ceil(dailyBurnRate * 14);
      const deficit = safetyStock > qty ? safetyStock - qty : 0;

      const lastKnownPrice =
        allProductInMovs.length > 0
          ? Number(allProductInMovs[0].unit_price)
          : Number(product.purchase_price ?? product.price ?? 0);

      const costToReorder = deficit * lastKnownPrice;

      categoryItemsToOrder += deficit;
      categoryBudget += costToReorder;

      let diffPercent = 0;
      let avgPrice = 0;
      if (inMovs.length > 0) {
        const totalReceivedQuantity = inMovs.reduce(
          (sum, movement) => sum + Number(movement.quantity || 0),
          0,
        );
        avgPrice =
          totalReceivedQuantity > 0
            ? inMovs.reduce(
                (sum, movement) =>
                  sum +
                  Number(movement.quantity || 0) *
                    Number(movement.unit_price || 0),
                0,
              ) / totalReceivedQuantity
            : 0;
        diffPercent =
          avgPrice > 0
            ? (((lastKnownPrice - avgPrice) / avgPrice) * 100).toFixed(1)
            : 0;
      }

      const prodStat = {
        id: product.id,
        name: product.name,
        code: product.product_code,
        qty,
        dailyBurnRate: dailyBurnRate.toFixed(2),
        daysRemaining,
        stockoutDate,
        deficit,
        safetyStock,
        costToReorder,
        isOutOfStock: qty <= 0,
        lastKnownPrice,
        avgPrice,
        diffPercent: Number(diffPercent),
      };

      if (daysRemaining !== null) stockoutRisks.push(prodStat);
      if (inMovs.length > 0) priceDeviations.push(prodStat);
    });

    stockoutRisks.sort((a, b) => a.daysRemaining - b.daysRemaining);
    priceDeviations.sort(
      (a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent),
    );

    const activePurchaseOrders = stockoutRisks.filter(
      (item) => item.deficit > 0,
    );

    const overallDailyRate = totalDailyBurnRate.toFixed(2);

    return {
      totalStock,
      categoryBudget,
      categoryItemsToOrder,
      outOfStockCount,
      stockoutRisks,
      priceDeviations,
      activePurchaseOrders,
      overallDailyRate,
      singleProduct:
        scopeType === "PRODUCT"
          ? stockoutRisks[0] ||
            priceDeviations[0] || {
              name: scopedProducts[0]?.name,
              daysRemaining: null,
              deficit: 0,
              safetyStock: 0,
              costToReorder: 0,
              diffPercent: 0,
              dailyBurnRate: "0.00",
            }
          : null,
    };
  }, [
    scopedProducts,
    filteredMovements,
    allInMovementsByProduct,
    scopeType,
    activeDaysCount,
  ]);

  const dynamicsChartData = useMemo(() => {
    const dataMap = {};
    filteredMovements.forEach((m) => {
      const dateKey = String(m.movement_date || m.created_at).slice(0, 10);
      if (!dataMap[dateKey])
        dataMap[dateKey] = { date: dateKey, Przyjęcia: 0, Wydania: 0 };
      if (m.movement_type === "IN")
        dataMap[dateKey].Przyjęcia += Number(m.quantity || 0);
      if (m.movement_type === "OUT")
        dataMap[dateKey].Wydania += Number(m.quantity || 0);
    });
    return Object.values(dataMap).sort(
      (a, b) => parseLocalDate(a.date) - parseLocalDate(b.date),
    );
  }, [filteredMovements]);

  const priceTimelineData = useMemo(() => {
    if (scopeType === "CATEGORY") return [];
    return filteredMovements
      .filter((m) => m.movement_type === "IN")
      .sort(
        (a, b) =>
          parseLocalDate(a.movement_date) - parseLocalDate(b.movement_date),
      )
      .map((m) => ({
        date: String(m.movement_date).slice(0, 10),
        cena: Number(m.unit_price || 0),
      }));
  }, [filteredMovements, scopeType]);

  if (loading)
    return (
      <div className="text-center py-5 fs-5 text-secondary">
        Ładowanie analizy WMS...
      </div>
    );

  return (
    <div
      className="container-fluid py-4 px-4"
      style={{ background: "#f8fbff", minHeight: "100vh" }}
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card p-3 shadow-sm border-0 mb-4 bg-white">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div>
            <h4 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-graph-up text-primary"></i> Planowanie zapasów
              i zakupów
            </h4>
            <small className="text-muted">
              Sprawdź tempo sprzedaży, ryzyko braku towaru i potrzebne zakupy
            </small>
          </div>

          <div className="d-flex align-items-center bg-light px-3 py-2 rounded shadow-sm border">
            <div>
              <span
                className="text-muted d-block fw-semibold"
                style={{ fontSize: "0.68rem" }}
              >
                {scopeType === "PRODUCT"
                  ? "Tempo wydań produktu:"
                  : "Sumaryczne tempo kategorii:"}
              </span>
              <strong className="text-dark">
                {scopeType === "PRODUCT" && analytics.singleProduct
                  ? `${analytics.singleProduct.dailyBurnRate} szt./dzień`
                  : `${analytics.overallDailyRate} szt./dzień`}
              </strong>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="bg-light p-1 rounded d-flex">
              <button
                className={`btn btn-sm ${scopeType === "CATEGORY" ? "btn-primary fw-bold" : "btn-light text-muted"}`}
                onClick={() => {
                  setScopeType("CATEGORY");
                  setScopeId(categories[0]?.id || "");
                }}
              >
                Cała kategoria
              </button>
              <button
                className={`btn btn-sm ${scopeType === "PRODUCT" ? "btn-primary fw-bold" : "btn-light text-muted"}`}
                onClick={() => {
                  setScopeType("PRODUCT");
                  setScopeId("");
                }}
              >
                Jeden produkt
              </button>
            </div>

            <div>
              {scopeType === "CATEGORY" ? (
                <select
                  className="form-select form-select-sm shadow-sm"
                  style={{ minWidth: "190px" }}
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              ) : (
                <ProductSearchSelect
                  products={products}
                  value={scopeId}
                  onChange={setScopeId}
                />
              )}
            </div>

            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm shadow-sm"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
              >
                <option value={7}>Ostatnie 7 dni</option>
                <option value={30}>Ostatnie 30 dni</option>
                <option value={90}>Ostatnie 90 dni</option>
                <option value={180}>Ostatnie pół roku</option>
                <option value={9999}>Pełna historia</option>
                <option value="custom">Własny zakres (Kalendarz)</option>
              </select>

              {timeRange === "custom" && (
                <div className="d-flex align-items-center gap-1 bg-white p-1 rounded border shadow-sm">
                  <input
                    type="date"
                    className="form-control form-control-sm border-0 p-0 shadow-none"
                    style={{
                      fontSize: "0.8rem",
                      width: "115px",
                      WebkitAppearance: "none",
                    }}
                    value={customStartDate}
                    onChange={(e) => {
                      const newStart = e.target.value || getDefaultPastStr(30);
                      setCustomStartDate(newStart);
                      // Jeśli nowa data "od" jest późniejsza niż obecna data "do", wyrównaj datę "do"
                      if (newStart > customEndDate) {
                        setCustomEndDate(newStart);
                      }
                    }}
                  />
                  <span className="text-muted small">—</span>
                  <input
                    type="date"
                    className="form-control form-control-sm border-0 p-0 shadow-none"
                    style={{
                      fontSize: "0.8rem",
                      width: "115px",
                      WebkitAppearance: "none",
                    }}
                    value={customEndDate}
                    min={customStartDate} // Blokada wyboru wcześniejszej daty niż "od"
                    onChange={(e) => {
                      const newEnd = e.target.value || getTodayStr();
                      // Zabezpieczenie: nie pozwalamy ustawić daty "do" wcześniejszej niż "od"
                      if (newEnd >= customStartDate) {
                        setCustomEndDate(newEnd);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        {/* KAFELEK 1: PREDYKCJA BRAKÓW */}
        <div className="col-md-6">
          <div className="card h-100 p-4 shadow-sm border-0 border-top border-4 border-danger bg-white">
            <h6 className="fw-bold text-danger text-uppercase small mb-3">
              <i className="bi bi-clock-history me-2"></i>Kiedy skończy się
              towar?
            </h6>

            {scopeType === "PRODUCT" && analytics.singleProduct ? (
              <div className="text-center mt-2">
                {analytics.singleProduct.daysRemaining !== null ? (
                  <>
                    <h2 className="fw-bold text-danger mb-0 display-6">
                      za {analytics.singleProduct.daysRemaining} dni
                    </h2>
                    <p className="text-muted fw-semibold mb-1">
                      Szacowana data wyczerpania:{" "}
                      {analytics.singleProduct.stockoutDate?.toLocaleDateString()}
                    </p>
                    <small className="text-muted d-block mt-3">
                      Stan: <strong>{analytics.singleProduct.qty} szt.</strong>
                      {" · "}
                      Tempo:{" "}
                      <strong>
                        {analytics.singleProduct.dailyBurnRate} szt./dzień
                      </strong>
                      {" · "}
                      Okres: {timeRangeLabel}
                    </small>
                  </>
                ) : (
                  <div className="text-success mt-4 fw-bold">
                    Brak wydań w wybranym okresie — nie można wiarygodnie
                    przewidzieć daty wyczerpania.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <small className="text-muted d-block mb-2">
                  Top 3 produkty z najszybszym tempem wyczerpania:
                </small>
                {analytics.stockoutRisks.length > 0 ? (
                  <ul className="list-group list-group-flush">
                    {analytics.stockoutRisks.slice(0, 3).map((item) => (
                      <li
                        key={item.id}
                        className="list-group-item px-0 d-flex justify-content-between align-items-center border-0 py-2 bg-transparent"
                      >
                        <span
                          className="small fw-semibold text-truncate"
                          style={{ maxWidth: "50%" }}
                          title={item.name}
                        >
                          {item.name}
                        </span>

                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="text-muted badge bg-light text-dark border font-monospace"
                            style={{ fontSize: "0.72rem" }}
                            title="Średnie tempo wydań WZ"
                          >
                            {item.dailyBurnRate} szt./d.
                          </span>
                          <span
                            className={`badge ${item.daysRemaining <= 7 ? "bg-danger" : "bg-warning text-dark"}`}
                          >
                            za {item.daysRemaining} dni
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-success fw-bold py-2">
                    Wszystkie stany w tej kategorii są zabezpieczone.
                  </div>
                )}
                <small
                  className="text-muted d-block mt-3"
                  style={{ fontSize: "0.75rem" }}
                >
                  * Szacunek na podstawie średniego tempa wydań (
                  {timeRangeLabel})
                </small>
              </div>
            )}
          </div>
        </div>

        {/* KAFELEK 2: PLANOWANIE ZAKUPÓW */}
        <div className="col-md-6">
          <div className="card h-100 p-4 shadow-sm border-0 border-top border-4 border-primary bg-white">
            <h6 className="fw-bold text-primary text-uppercase small mb-3">
              <i className="bi bi-cart-check me-2"></i>Co i za ile dokupić?
            </h6>

            {scopeType === "PRODUCT" && analytics.singleProduct ? (
              <div className="text-center mt-2">
                {analytics.singleProduct.deficit > 0 ? (
                  <>
                    <h2 className="fw-bold text-primary mb-0 display-6">
                      {analytics.singleProduct.deficit} szt.
                    </h2>
                    <p className="text-muted fw-semibold mb-1">
                      Zalecane zamówienie
                    </p>
                    <p className="text-dark fw-semibold mb-1 mt-3">
                      Szacunkowy budżet:{" "}
                      <span className="text-primary">
                        {formatCurrency(analytics.singleProduct.costToReorder)}{" "}
                        zł
                      </span>
                    </p>
                    <small className="text-muted d-block mt-2">
                      {analytics.singleProduct.deficit} ×{" "}
                      {formatCurrency(analytics.singleProduct.lastKnownPrice)}{" "}
                      zł/szt. (ostatnia cena PZ)
                    </small>
                  </>
                ) : (
                  <h5 className="text-success mt-4 fw-bold">
                    Stan optymalny — zapas pokrywa 14 dni pracy
                  </h5>
                )}
              </div>
            ) : (
              <div className="mt-1">
                <h4 className="fw-bold text-dark mb-0">
                  Łącznie do domówienia:{" "}
                  <span className="text-primary">
                    {analytics.categoryItemsToOrder} szt.
                  </span>
                </h4>
                <p
                  className="text-muted fw-semibold mb-2"
                  style={{ fontSize: "0.9rem" }}
                >
                  Wymagany budżet: {formatCurrency(analytics.categoryBudget)} zł
                </p>

                {analytics.outOfStockCount > 0 &&
                analytics.activePurchaseOrders.length === 0 ? (
                  <div className="text-warning fw-bold py-2">
                    {analytics.outOfStockCount} produkt(y) nie ma na stanie.
                    Brak historii wydań uniemożliwia wiarygodne wyliczenie
                    ilości zamówienia.
                  </div>
                ) : analytics.activePurchaseOrders &&
                  analytics.activePurchaseOrders.length > 0 ? (
                  <ul className="list-group list-group-flush small mt-2">
                    {analytics.activePurchaseOrders.slice(0, 3).map((item) => (
                      <li
                        key={`order-${item.id}`}
                        className="list-group-item px-0 py-1 bg-transparent d-flex justify-content-between align-items-center border-0"
                      >
                        <span
                          className="text-truncate text-dark fw-semibold"
                          style={{ maxWidth: "180px" }}
                        >
                          {item.name}
                        </span>
                        <span className="text-primary text-end">
                          {item.deficit} szt.{" "}
                          <small className="text-muted">
                            ({formatCurrency(item.costToReorder)} zł)
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-success fw-bold py-2">
                    Nie ma niedoborów — wszystkie stany pokrywają 14-dniowy
                    bufor.
                  </div>
                )}
                <small
                  className="text-muted d-block mt-3"
                  style={{ fontSize: "0.75rem" }}
                >
                  * Brakujące sztuki × ostatnia cena zakupu z PZ
                </small>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row mb-4">
        <div className="col-12">
          <div className="card p-4 shadow-sm border-0 bg-white">
            <h6 className="fw-bold text-secondary mb-3">
              {scopeType === "CATEGORY"
                ? "Ile przyjęto i wydano"
                : "Jak zmieniała się cena zakupu"}
            </h6>

            {scopeType === "CATEGORY" ? (
              dynamicsChartData.length === 0 ? (
                <p className="text-center text-muted py-5">
                  Brak ruchów magazynowych w wybranym okresie.
                </p>
              ) : (
                <div style={{ width: "100%", height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dynamicsChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(tick) => {
                          const d = parseLocalDate(tick);
                          return d.toLocaleDateString("pl-PL", {
                            day: "2-digit",
                            month: "2-digit",
                          });
                        }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="Przyjęcia"
                        stroke="#198754"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Wydania"
                        stroke="#dc3545"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : priceTimelineData.length === 0 ? (
              <p className="text-center text-muted py-5">
                Brak dokumentów PZ dla tego produktu w wybranym czasie.
              </p>
            ) : (
              <div style={{ width: "100%", height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceTimelineData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(tick) => {
                        const d = parseLocalDate(tick);
                        return d.toLocaleDateString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                        });
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={["dataMin - 100", "dataMax + 100"]}
                      unit=" zł"
                    />
                    <Tooltip formatter={(val) => `${formatCurrency(val)} zł`} />
                    <Line
                      type="stepAfter"
                      dataKey="cena"
                      name="Cena zakupu z PZ"
                      stroke="#0d6efd"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row g-4">
        {scopeType === "PRODUCT" && (
          <div className="col-md-6">
            <div className="card h-100 p-4 shadow-sm border-0 bg-white">
              <h6 className="fw-bold text-secondary mb-3">
                Ile przyjęto i wydano
              </h6>
              {dynamicsChartData.length === 0 ? (
                <p className="text-center text-muted mt-4">
                  Brak ruchów magazynowych w wybranym okresie.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dynamicsChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(tick) => {
                        const d = parseLocalDate(tick);
                        return d.toLocaleDateString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                        });
                      }}
                    />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar
                      dataKey="Przyjęcia"
                      fill="#198754"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Wydania"
                      fill="#dc3545"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        <div className={scopeType === "PRODUCT" ? "col-md-6" : "col-md-12"}>
          <div className="card h-100 p-4 shadow-sm border-0 bg-white">
            <h6 className="fw-bold text-secondary mb-3">Zmiany cen zakupu</h6>

            {scopeType === "PRODUCT" && analytics.singleProduct ? (
              <div className="mt-4 text-center">
                <h4 className="fw-bold text-dark">
                  Ostatnia cena zakupu z PZ:{" "}
                  <span className="text-primary">
                    {formatCurrency(analytics.singleProduct.lastKnownPrice)} zł
                  </span>
                </h4>
                {analytics.singleProduct.diffPercent !== 0 ? (
                  <div className="mt-3">
                    Ostatnia cena różni się o{" "}
                    <span
                      className={`badge fs-6 ${analytics.singleProduct.diffPercent > 0 ? "bg-danger" : "bg-success"}`}
                    >
                      {analytics.singleProduct.diffPercent > 0 ? "+" : ""}
                      {analytics.singleProduct.diffPercent}%
                    </span>{" "}
                    {analytics.singleProduct.diffPercent > 0
                      ? "wyższa"
                      : "niższa"}{" "}
                    niż średnia z badanego okresu (
                    {formatCurrency(analytics.singleProduct.avgPrice)} zł).
                  </div>
                ) : (
                  <p className="text-muted mt-3">
                    Cena stabilna w badanym okresie (średnia:{" "}
                    {formatCurrency(analytics.singleProduct.avgPrice)} zł)
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="small text-muted mb-3">
                  Modele o największych odchyleniach ceny z ostatniej dostawy
                  względem średniej:
                </p>
                {analytics.priceDeviations.length === 0 ? (
                  <p className="text-muted">
                    Brak dokumentów PZ do porównania.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <tbody>
                        {analytics.priceDeviations.slice(0, 5).map((p) => (
                          <tr key={p.id}>
                            <td className="fw-semibold small w-50">{p.name}</td>
                            <td className="text-muted small w-25">
                              Ostatnio:{" "}
                              <strong>
                                {formatCurrency(p.lastKnownPrice)} zł
                              </strong>
                              <br />
                              Średnio: {formatCurrency(p.avgPrice)} zł
                            </td>
                            <td className="text-end w-25">
                              <span
                                className={`badge ${p.diffPercent > 0 ? "bg-danger" : "bg-success"}`}
                              >
                                {p.diffPercent > 0 ? "+" : ""}
                                {p.diffPercent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <small
                  className="text-muted d-block mt-2"
                  style={{ fontSize: "0.75rem" }}
                >
                  * Porównanie ostatniej ceny z PZ ze średnią ważoną ilością
                </small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WmsAnalytics;
