import React, { useState, useEffect, useMemo } from "react";
import API from "../api/axios";

const formatMovementDate = (value) => {
  const dateOnly = String(value || "").slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)
    ? new Date(
        Number(dateOnly.slice(0, 4)),
        Number(dateOnly.slice(5, 7)) - 1,
        Number(dateOnly.slice(8, 10)),
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pl-PL");
};

const formatCurrency = (value) =>
  Number(value).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getLocalDateString = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const MovementModal = ({ product, movementType, onSave, onClose }) => {
  const isPZ = movementType === "IN";
  const todayStr = getLocalDateString();

  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(
    product?.purchase_price ?? product?.price ?? 0,
  );
  const [movementDate, setMovementDate] = useState(todayStr);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [productMovements, setProductMovements] = useState([]);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [movementHistoryError, setMovementHistoryError] = useState("");

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setUnitPrice(product.purchase_price ?? product.price ?? 0);
      setMovementDate(todayStr);
      setNotes("");
      setFormError("");
      setMovementHistoryError("");

      if (!isPZ) {
        setProductMovements([]);
        setIsLoadingMovements(true);
        API.get("/movements", { params: { productId: product.id } })
          .then((res) => {
            setProductMovements(res.data || []);
          })
          .catch((err) => {
            console.error("Błąd pobierania historii partii:", err);
            setProductMovements([]);
            setMovementHistoryError(
              "Nie udało się pobrać historii partii. Wydanie jest chwilowo niedostępne.",
            );
          })
          .finally(() => {
            setIsLoadingMovements(false);
          });
      }
    }
  }, [product, movementType, todayStr, isPZ]);

  // FIFO: najstarsze przyjęcia są zużywane jako pierwsze.
  const batchPreview = useMemo(() => {
    if (isPZ) return { breakdown: [], isShortage: false };

    const ledgerQuantity = productMovements.reduce((total, movement) => {
      const movementQuantity = Number(movement.quantity);
      return (
        total +
        (String(movement.movement_type).toUpperCase() === "IN"
          ? movementQuantity
          : -movementQuantity)
      );
    }, 0);
    const openingQuantity = Number(product.quantity) - ledgerQuantity;
    const batches =
      openingQuantity > 0
        ? [
            {
              id: `opening-${product.id}`,
              date: product.created_at || todayStr,
              quantityAvailable: openingQuantity,
              unitPrice: Number(product.purchase_price ?? product.price) || 0,
              isOpeningBalance: true,
            },
          ]
        : [];
    const sortedMovements = [...productMovements].sort((a, b) => {
      const dateDifference =
        new Date(a.movement_date).getTime() -
        new Date(b.movement_date).getTime();
      if (dateDifference !== 0) return dateDifference;

      const createdDifference =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (createdDifference !== 0) return createdDifference;
      return Number(a.id) - Number(b.id);
    });
    sortedMovements.forEach((m) => {
      const qty = Number(m.quantity);
      const movementType = String(m.movement_type).toUpperCase();

      if (movementType === "IN" && qty > 0) {
        batches.push({
          id: m.id,
          date: m.movement_date || todayStr,
          quantityAvailable: qty,
          unitPrice: Number(m.unit_price) || 0,
          isOpeningBalance: false,
        });
      } else if (movementType === "OUT" && qty > 0) {
        let qtyToSubtract = qty;
        for (const batch of batches) {
          if (qtyToSubtract <= 0) break;
          if (batch.quantityAvailable > 0) {
            const take = Math.min(batch.quantityAvailable, qtyToSubtract);
            batch.quantityAvailable -= take;
            qtyToSubtract -= take;
          }
        }
      }
    });
    const activeBatches = batches.filter((b) => b.quantityAvailable > 0);
    const targetQty = Number(quantity);
    if (targetQty <= 0) {
      return { breakdown: [], isShortage: false };
    }

    let remainingNeeded = targetQty;
    const breakdown = [];

    for (let batch of activeBatches) {
      if (remainingNeeded <= 0) break;
      const qtyFromBatch = Math.min(batch.quantityAvailable, remainingNeeded);
      breakdown.push({
        batchId: batch.id,
        date: batch.date,
        quantity: qtyFromBatch,
        availableQuantity: batch.quantityAvailable,
        unitPrice: batch.unitPrice,
        totalPrice: qtyFromBatch * batch.unitPrice,
        isOpeningBalance: batch.isOpeningBalance,
      });
      remainingNeeded -= qtyFromBatch;
    }
    return {
      breakdown,
      isShortage: remainingNeeded > 0,
      totalPrice: breakdown.reduce((sum, item) => sum + item.totalPrice, 0),
    };
  }, [
    isPZ,
    productMovements,
    quantity,
    todayStr,
    product?.created_at,
    product?.id,
    product?.price,
    product?.purchase_price,
    product?.quantity,
  ]);

  if (!product) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      setFormError("Liczba sztuk musi być większa od zera.");
      return;
    }

    // Blokada: nie można wydać więcej niż aktualny stan w kartotece produktu
    if (!isPZ && parsedQty > product.quantity) {
      setFormError(
        `Nie można wydać więcej niż dostępny stan magazynowy (${product.quantity} szt.).`,
      );
      return;
    }

    // Blokada: niedobór w niezużytych partiach FIFO
    if (!isPZ && (movementHistoryError || batchPreview.isShortage)) {
      setFormError(
        movementHistoryError ||
          "Wprowadzona ilość przekracza dostępne niezużyte partie dostaw FIFO.",
      );
      return;
    }

    const parsedPrice = parseFloat(unitPrice);
    if (isPZ && (isNaN(parsedPrice) || parsedPrice < 0)) {
      setFormError("Cena jednostkowa musi być poprawną liczbą nieujemną.");
      return;
    }

    if (!movementDate) {
      setFormError("Proszę wskazać datę operacji.");
      return;
    }

    const payload = {
      productId: product.id,
      quantity: parsedQty,
      movementDate,
      notes: notes.trim() || undefined,
    };

    if (isPZ) {
      payload.unitPrice = parsedPrice;
    }

    setIsSubmitting(true);
    onSave(movementType, payload)
      .catch((err) => {
        const msg =
          err.response?.data?.message ||
          "Wystąpił błąd podczas rejestracji ruchu.";
        setFormError(msg);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleQuantityChange = (e) => {
    const rawValue = e.target.value;
    if (rawValue === "") {
      setQuantity("");
      return;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isInteger(parsedValue) || parsedValue < 1) return;

    const maximumQuantity = Number(product.quantity);
    setQuantity(
      !isPZ && parsedValue > maximumQuantity ? maximumQuantity : parsedValue,
    );
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow">
          <div
            className={`modal-header text-white ${
              isPZ ? "bg-success" : "bg-warning text-dark"
            }`}
          >
            <h5 className="modal-title fw-bold fs-6 d-flex align-items-center gap-2">
              <i
                className={`bi ${
                  isPZ ? "bi-box-arrow-in-down" : "bi-box-arrow-up"
                }`}
              ></i>
              {isPZ
                ? "Przyjęcie Towaru (Dokument PZ)"
                : "Wydanie Towaru (Dokument WZ)"}
            </h5>
            <button
              type="button"
              className={`btn-close ${isPZ ? "btn-close-white" : ""}`}
              onClick={onClose}
              disabled={isSubmitting}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {formError && (
                <div className="alert alert-danger py-2 small fw-semibold mb-3">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {formError}
                </div>
              )}

              <div className="bg-light p-3 rounded border mb-3">
                <span className="text-muted d-block small">
                  Wybrany produkt:
                </span>
                <strong className="text-dark fs-6 d-block">
                  {product.name}
                </strong>
                <div className="d-flex justify-content-between mt-2 pt-2 border-top small text-secondary">
                  <span>
                    SKU: <strong>{product.product_code}</strong>
                  </span>
                  <span>
                    Aktualny stan:{" "}
                    <strong className="text-dark">
                      {product.quantity} szt.
                    </strong>
                  </span>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">
                  Ilość do {isPZ ? "przyjęcia" : "wydania"} *
                </label>
                <input
                  type="number"
                  min="1"
                  max={!isPZ ? product.quantity : undefined}
                  className="form-control"
                  value={quantity}
                  onChange={handleQuantityChange}
                  required
                  autoFocus
                />
              </div>

              {isPZ ? (
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary">
                    Cena zakupu (zł/szt.) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    required
                  />
                  <small className="text-muted" style={{ fontSize: "0.75rem" }}>
                    Zarejestruje nową partię dostawy w historii ruchów.
                  </small>
                </div>
              ) : (
                <div className="mb-3 p-3 bg-light rounded border">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold text-dark small d-flex align-items-center gap-1">
                      <i className="bi bi-layers-fill text-warning"></i>
                      Informacja o partiach towaru
                    </span>
                    {isLoadingMovements && (
                      <span className="spinner-border spinner-border-sm text-secondary"></span>
                    )}
                  </div>

                  {batchPreview.breakdown.length > 0 ? (
                    <>
                      <div className="list-group">
                        {batchPreview.breakdown.map((item, idx) => (
                          <div
                            key={`${item.batchId}-${idx}`}
                            className="list-group-item d-flex justify-content-between align-items-center py-2 px-3 small"
                          >
                            <span className="text-secondary flex-grow-1">
                              Wydanie: <strong>{item.quantity} szt.</strong> z{" "}
                              <strong>
                                {item.availableQuantity} dostępnych
                              </strong>{" "}
                              | partia {formatMovementDate(item.date)}
                            </span>
                            <strong
                              className="text-dark text-nowrap ms-2 text-end"
                              style={{ minWidth: "155px" }}
                            >
                              {formatCurrency(item.unitPrice)} zł/szt. |{" "}
                              {formatCurrency(item.totalPrice)} zł
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div className="d-flex justify-content-end align-items-center small text-muted mt-3 px-2">
                        <span className="me-2">
                          Łączny koszt wydanych sztuk:
                        </span>
                        <strong
                          className="text-dark text-end"
                          style={{ minWidth: "90px" }}
                        >
                          {formatCurrency(batchPreview.totalPrice)} zł
                        </strong>
                      </div>
                    </>
                  ) : (
                    <div className="text-muted small italic py-1">
                      {isLoadingMovements
                        ? "Ładowanie historycznych partii z bazy..."
                        : "Brak dostępnych partii do wydania lub brak danych dla produktu."}
                    </div>
                  )}
                  {movementHistoryError && (
                    <div className="alert alert-danger py-2 mt-2 mb-0 small">
                      {movementHistoryError}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label small fw-semibold text-secondary">
                  Data operacji *
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  required
                />
              </div>

              <div className="mb-2">
                <label className="form-label small fw-semibold text-secondary">
                  Nr dokumentu / uwagi (opcjonalnie)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={
                    isPZ
                      ? "np. Faktura VAT 102/2026"
                      : "np. Wydanie dla Działu IT / WZ-12"
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>

            <div className="modal-footer bg-light py-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm px-3"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Anuluj
              </button>
              <button
                type="submit"
                className={`btn btn-sm px-4 fw-bold ${
                  isPZ ? "btn-success" : "bg-warning text-dark"
                }`}
                disabled={
                  isSubmitting ||
                  (!isPZ && product.quantity === 0) ||
                  (!isPZ && movementHistoryError)
                }
              >
                {isSubmitting
                  ? "Zapisywanie..."
                  : isPZ
                    ? "Zatwierdź Przyjęcie (PZ)"
                    : "Zatwierdź Wydanie (WZ)"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MovementModal;
