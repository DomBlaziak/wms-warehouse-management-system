import React, { useState, useEffect, useMemo } from "react";
import API from "../api/axios";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "../styles/dashboard.css";
import { getInventoryCostSummary } from "../utils/inventoryCost";

const PIE_COLORS = [
  "#0d6efd",
  "#00b32a",
  "#ffc107",
  "#f4400a",
  "#0dcaf0",
  "#6f42c1",
];
const BAR_COLORS = ["#6f42c1", "#0d6efd", "#198754", "#fd7e14", "#0dcaf0"];

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseLocalDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const GeneralStats = () => {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError("");
      const [prodRes, movRes, catRes] = await Promise.all([
        API.get("/products"),
        API.get("/movements"),
        API.get("/categories"),
      ]);

      setProducts(prodRes.data || []);
      setMovements(movRes.data || []);
      setCategories(catRes.data || []);
    } catch (err) {
      setError("Nie udało się pobrać danych statystycznych.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const financials = useMemo(() => {
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let criticalCount = 0;
    const inventoryCosts = {};

    products.forEach((p) => {
      const costSummary = getInventoryCostSummary(
        p,
        movements.filter((m) => String(m.product_id) === String(p.id)),
      );
      inventoryCosts[p.id] = costSummary;
      const qty = costSummary.quantity;
      const retail = Number(p.selling_price ?? p.price ?? 0);

      totalCostValue += costSummary.totalCost;
      totalRetailValue += qty * retail;
      if (qty < 4) criticalCount++;
    });

    const projectedProfit = totalRetailValue - totalCostValue;
    return {
      totalCostValue,
      totalRetailValue,
      projectedProfit,
      criticalCount,
      inventoryCosts,
    };
  }, [products, movements]);

  const capitalByCategory = useMemo(() => {
    const capitalMap = {};
    products.forEach((p) => {
      const catName =
        categories.find((c) => String(c.id) === String(p.category_id))?.name ||
        "Inne";
      const costValue = financials.inventoryCosts[p.id]?.totalCost || 0;

      if (costValue > 0) {
        capitalMap[catName] = (capitalMap[catName] || 0) + costValue;
      }
    });

    return Object.entries(capitalMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [products, categories, financials.inventoryCosts]);

  const topProfitableProducts = useMemo(() => {
    return products
      .map((p) => {
        const costSummary = financials.inventoryCosts[p.id];
        const cost =
          costSummary?.averageCost || Number(p.purchase_price ?? p.price ?? 0);
        const retail = Number(p.selling_price ?? p.price ?? 0);
        return {
          name: p.name,
          unitProfit: retail - cost,
          quantity: costSummary?.quantity || 0,
        };
      })
      .filter((p) => p.quantity > 0 && p.unitProfit > 0)
      .sort((a, b) => b.unitProfit - a.unitProfit)
      .slice(0, 5);
  }, [products, financials.inventoryCosts]);

  const topRevenueGenerators = useMemo(() => {
    const revenueMap = {};
    const outMovements = movements.filter((m) => m.movement_type === "OUT");

    outMovements.forEach((m) => {
      const prod = products.find((p) => String(p.id) === String(m.product_id));
      const retailPrice =
        m.selling_price !== null && m.selling_price !== undefined
          ? Number(m.selling_price)
          : prod
            ? Number(prod.selling_price ?? prod.price ?? 0)
            : 0;
      const rev = Number(m.quantity || 0) * retailPrice;

      if (rev > 0 && prod) {
        const productId = String(prod.id);
        if (!revenueMap[productId]) {
          revenueMap[productId] = {
            name: prod.name || m.product_name || "Produkt",
            revenue: 0,
          };
        }
        revenueMap[productId].revenue += rev;
      }
    });

    return Object.values(revenueMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [movements, products]);

  const deadStockItems = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    return products
      .filter((p) => (financials.inventoryCosts[p.id]?.quantity || 0) > 0)
      .map((product) => {
        const outLogs = movements.filter(
          (m) =>
            String(m.product_id) === String(product.id) &&
            m.movement_type === "OUT",
        );
        const lastOut =
          outLogs.length > 0
            ? outLogs
                .map((m) => parseLocalDate(m.movement_date || m.created_at))
                .filter(Boolean)
                .sort((a, b) => b - a)[0]
            : parseLocalDate(product.created_at);

        return {
          name: product.name,
          frozenValue: financials.inventoryCosts[product.id]?.totalCost || 0,
          isDead: lastOut < thirtyDaysAgo,
        };
      })
      .filter((p) => p.isDead && p.frozenValue > 0)
      .sort((a, b) => b.frozenValue - a.frozenValue)
      .slice(0, 3);
  }, [products, movements, financials.inventoryCosts]);

  if (loading) {
    return (
      <div className="text-center py-5 fs-5 text-secondary">
        Trwa ładowanie statystyk...
      </div>
    );
  }

  return (
    <div
      className="container-fluid py-4 px-4"
      style={{
        background: "linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)",
        minHeight: "100vh",
      }}
    >
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="fw-bold text-dark mb-1">
            Przegląd magazynu i wyniku sprzedażowego
          </h3>
          <small className="text-muted">
            Podsumowanie kosztu zapasu, wartości sprzedaży, wyniku i niskich
            stanów
          </small>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm px-3 shadow-sm"
          onClick={fetchAnalyticsData}
        >
          Odśwież dane
        </button>
      </div>

      <div className="row g-3 mb-5 analytics-overview-grid">
        <div className="col-md-3">
          <div className="card analytics-overview-card analytics-overview-card--blue h-100">
            <div className="card-body analytics-overview-card__body">
              <small className="analytics-overview-card__label">
                Koszt zapasu według aktywnych partii
              </small>
              <h3 className="analytics-overview-card__value text-primary">
                {formatCurrency(financials.totalCostValue)} zł
              </h3>
              <small className="analytics-overview-card__meta text-muted d-block mt-1">
                Ilość pozostała w partiach × cena zakupu
              </small>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card analytics-overview-card analytics-overview-card--green h-100">
            <div className="card-body analytics-overview-card__body">
              <small className="analytics-overview-card__label">
                Wartość zapasu według cen sprzedaży
              </small>
              <h3 className="analytics-overview-card__value text-success">
                {formatCurrency(financials.totalRetailValue)} zł
              </h3>
              <small className="analytics-overview-card__meta text-muted d-block mt-1">
                Bieżący stan × cena sprzedaży produktu
              </small>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div
            className="card analytics-overview-card analytics-overview-card--purple h-100"
            style={{ color: "#6f42c1" }}
          >
            <div className="card-body analytics-overview-card__body">
              <small
                className="analytics-overview-card__label"
                style={{ color: "#6f42c1" }}
              >
                Potencjalny wynik na zapasie
              </small>
              <h3
                className="analytics-overview-card__value"
                style={{ color: "#6f42c1" }}
              >
                {formatCurrency(financials.projectedProfit)} zł
              </h3>
              <small className="analytics-overview-card__meta text-muted d-block mt-1">
                Wartość sprzedaży zapasu − koszt aktywnych partii
              </small>
            </div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card analytics-overview-card analytics-overview-card--red h-100">
            <div className="card-body analytics-overview-card__body">
              <small className="analytics-overview-card__label">
                Niskie stany magazynowe
              </small>
              <h3 className="analytics-overview-card__value text-danger">
                {financials.criticalCount}
              </h3>
              <small className="analytics-overview-card__meta text-muted d-block mt-1">
                Produkty z bieżącym stanem poniżej 4 szt.
              </small>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-5">
        <div className="col-md-6">
          <div className="card p-4 border-0 shadow-sm h-100 text-center bg-white">
            <h6 className="fw-bold text-secondary mb-1">
              Koszt zapasu według kategorii
            </h6>
            <small className="text-muted d-block mb-3">
              Koszt zakupu towaru pozostającego obecnie na magazynie
            </small>
            {capitalByCategory.length === 0 ? (
              <div className="py-5 text-muted">Brak towaru na magazynie.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={capitalByCategory}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius={45}
                      outerRadius={85}
                      paddingAngle={4}
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    >
                      {capitalByCategory.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => `${formatCurrency(value)} zł`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-4 border-0 shadow-sm h-100 text-center bg-white">
            <h6 className="fw-bold text-secondary mb-1">
              Potencjalny zysk na sztuce
            </h6>
            <small className="text-muted d-block mb-3">
              Cena sprzedaży − średni koszt pozostałych aktywnych partii
            </small>
            {topProfitableProducts.length === 0 ? (
              <div className="py-5 text-muted">Brak wycenionych produktów.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topProfitableProducts}
                    layout="vertical"
                    margin={{ top: 5, right: 35, left: 15, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      unit=" zł"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val) =>
                        Number(val).toLocaleString("pl-PL")
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [
                        `+${formatCurrency(value)} zł`,
                        "Potencjalny zysk na sztuce",
                      ]}
                    />
                    <Bar dataKey="unitProfit" radius={[0, 8, 8, 0]}>
                      {topProfitableProducts.map((entry, index) => (
                        <Cell
                          key={`bar-${index}`}
                          fill={BAR_COLORS[index % BAR_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-md-6">
          <div className="card p-3 border-0 shadow-sm bg-white">
            <h6 className="fw-bold text-center text-success mb-1">
              Największy obrót ze sprzedaży
            </h6>
            <small className="text-muted d-block text-center mb-3">
              Suma wartości wydań z dokumentów WZ
            </small>
            <ul className="list-group list-group-flush">
              {topRevenueGenerators.length === 0 ? (
                <li className="list-group-item text-muted text-center py-3">
                  Brak historii wydań WZ.
                </li>
              ) : (
                topRevenueGenerators.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="list-group-item d-flex justify-content-between align-items-center py-2 border-0 px-0 bg-transparent"
                  >
                    <span
                      className="fw-semibold text-truncate"
                      style={{ maxWidth: "60%" }}
                    >
                      {item.name}
                    </span>
                    <span className="badge rounded-pill bg-success px-3 py-2 fs-6">
                      {formatCurrency(item.revenue)} zł
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-3 border-0 shadow-sm bg-white">
            <h6 className="fw-bold text-center text-danger mb-1">
              Towar bez rotacji (&gt; 30 dni)
            </h6>
            <small className="text-muted d-block text-center mb-3">
              Produkty bez wydań w ostatnich 30 dniach
            </small>
            <ul className="list-group list-group-flush">
              {deadStockItems.length === 0 ? (
                <li className="list-group-item text-muted text-center py-3">
                  Wszystkie towary rotują na bieżąco.
                </li>
              ) : (
                deadStockItems.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="list-group-item d-flex justify-content-between align-items-center py-2 border-0 px-0 bg-transparent"
                  >
                    <span
                      className="fw-semibold text-truncate"
                      style={{ maxWidth: "60%" }}
                    >
                      {item.name}
                    </span>
                    <span className="badge rounded-pill bg-danger px-3 py-2 fs-6">
                      Wartość zapasu: {formatCurrency(item.frozenValue)} zł
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralStats;
