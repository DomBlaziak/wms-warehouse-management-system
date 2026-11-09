import React, { useEffect, useMemo, useState } from "react";
import API from "../api/axios";
import { getInventoryCostSummary } from "../utils/inventoryCost";

const generateNextSequentialSku = (
  categoryName,
  productName,
  existingProducts = [],
) => {
  const prefix = (categoryName || "IT")
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const cleanName = (productName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const tag = cleanName.length >= 3 ? `${cleanName.slice(0, 3)}-` : "";

  let maxNumber = 0;
  existingProducts.forEach((p) => {
    const code = String(p.product_code || "").toUpperCase();
    if (code.startsWith(prefix)) {
      const match = code.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
  });
  return `${prefix}-${tag}${String(maxNumber + 1).padStart(3, "0")}`;
};

const ProductModal = ({
  productToEdit,
  categories = [],
  existingProducts = [],
  currentUser,
  onSave,
  onClose,
}) => {
  const isEditMode = Boolean(productToEdit);

  const roleName = currentUser?.roleName || currentUser?.role_name || "";
  const isManager = roleName === "Kierownik";

  const [formData, setFormData] = useState({
    name: "",
    productCode: "",
    quantity: 0,
    purchasePrice: 0,
    sellingPrice: 0,
    categoryId: categories[0]?.id || "",
    attributes: {},
  });
  const [formError, setFormError] = useState("");
  const [productMovements, setProductMovements] = useState([]);

  const activeCategory = useMemo(() => {
    return (
      categories.find((c) => String(c.id) === String(formData.categoryId)) ||
      categories[0]
    );
  }, [categories, formData.categoryId]);

  const dynamicFields = useMemo(() => {
    if (!activeCategory?.required_attributes) return [];
    if (Array.isArray(activeCategory.required_attributes))
      return activeCategory.required_attributes;
    try {
      return JSON.parse(activeCategory.required_attributes);
    } catch {
      return [];
    }
  }, [activeCategory]);

  const inventoryCost = useMemo(
    () =>
      isEditMode
        ? getInventoryCostSummary(productToEdit, productMovements)
        : { averageCost: Number(formData.purchasePrice) || 0 },
    [isEditMode, productToEdit, productMovements, formData.purchasePrice],
  );
  const averageInventoryCost = inventoryCost.averageCost;

  const marginInfo = useMemo(() => {
    const purchase = inventoryCost.averageCost;
    const selling = Number(formData.sellingPrice) || 0;

    if (selling <= 0 || purchase <= 0) {
      return { margin: 0, markup: 0, profit: 0, isValid: false, isLoss: false };
    }

    const profit = selling - purchase;
    const margin = (profit / selling) * 100;
    const markup = (profit / purchase) * 100;
    const isLoss = profit < 0; // Wykrywa czy występuje strata

    return {
      margin: margin.toFixed(1),
      markup: markup.toFixed(1),
      profit: profit.toFixed(2),
      isValid: true,
      isLoss,
      cost: purchase.toFixed(2),
    };
  }, [inventoryCost.averageCost, formData.sellingPrice]);

  useEffect(() => {
    setProductMovements([]);

    if (productToEdit) {
      const cat = categories.find(
        (c) => String(c.id) === String(productToEdit.category_id),
      );
      let fields = [];
      if (cat?.required_attributes) {
        fields = Array.isArray(cat.required_attributes)
          ? cat.required_attributes
          : JSON.parse(cat.required_attributes || "[]");
      }

      const mergedAttrs = { ...(productToEdit.attributes || {}) };
      fields.forEach((f) => {
        if (
          mergedAttrs[f.key] === undefined ||
          mergedAttrs[f.key] === null ||
          mergedAttrs[f.key] === ""
        ) {
          // Jeśli pole to select, ustawiamy pusty string, żeby wymusić wybór z  Wybierz opcję
          mergedAttrs[f.key] = "";
        }
      });

      setFormData({
        name: productToEdit.name || "",
        productCode: productToEdit.product_code || "",
        quantity: productToEdit.quantity || 0,
        purchasePrice: productToEdit.purchase_price ?? productToEdit.price ?? 0,
        sellingPrice: productToEdit.selling_price ?? productToEdit.price ?? 0,
        categoryId: productToEdit.category_id || categories[0]?.id || "",
        attributes: mergedAttrs,
      });

      API.get("/movements", { params: { productId: productToEdit.id } })
        .then((response) => setProductMovements(response.data || []))
        .catch((error) => {
          console.error("Błąd pobierania kosztu partii produktu:", error);
        });
    } else {
      const defaultAttrs = {};
      dynamicFields.forEach((f) => {
        defaultAttrs[f.key] = "";
      });
      setFormData((prev) => ({
        name: "",
        productCode: "",
        quantity: 0,
        purchasePrice: 0,
        sellingPrice: 0,
        categoryId: prev.categoryId || categories[0]?.id || "",
        attributes: defaultAttrs,
      }));
    }
    setFormError("");
  }, [productToEdit, categories, dynamicFields]);

  const handleCategoryChange = (e) => {
    const newCatId = e.target.value;
    const cat = categories.find((c) => String(c.id) === String(newCatId));
    let fields = [];
    if (cat?.required_attributes) {
      fields = Array.isArray(cat.required_attributes)
        ? cat.required_attributes
        : JSON.parse(cat.required_attributes || "[]");
    }
    const defaultAttrs = {};
    fields.forEach((f) => {
      defaultAttrs[f.key] = "";
    });
    setFormData((prev) => ({
      ...prev,
      categoryId: newCatId,
      attributes: defaultAttrs,
    }));
  };

  const handleGenerateSku = () => {
    if (!formData.name.trim() || isEditMode) return;
    setFormData((prev) => ({
      ...prev,
      productCode: generateNextSequentialSku(
        activeCategory?.name,
        formData.name,
        existingProducts,
      ),
    }));
  };

  const handleAttributeChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      attributes: { ...prev.attributes, [key]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!formData.name.trim()) {
      return setFormError("Proszę podać nazwę sprzętu.");
    }
    if (!formData.productCode.trim()) {
      return setFormError("Proszę wygenerować kod SKU.");
    }

    for (const field of dynamicFields) {
      if (field.required) {
        const val = formData.attributes?.[field.key];
        if (val === undefined || val === null || String(val).trim() === "") {
          return setFormError(
            `Parametr "${field.label}" jest wymagany dla tej kategorii.`,
          );
        }
      }
    }

    try {
      await onSave(formData);
    } catch (err) {
      setFormError(err.response?.data?.message || "Błąd podczas zapisu.");
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title fw-bold fs-6">
              {isEditMode
                ? `Edycja zasobu: ${productToEdit.name}`
                : "Dodawanie nowego zasobu"}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4">
              {formError && (
                <div className="alert alert-danger py-2 mb-3 small fw-semibold">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {formError}
                </div>
              )}

              <h6 className="fw-bold text-dark mb-2 small text-uppercase">
                Kategoria zasobu
              </h6>
              <div className="mb-4">
                <select
                  className="form-select"
                  value={formData.categoryId}
                  onChange={handleCategoryChange}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <h6 className="fw-bold text-dark mb-3 small text-uppercase">
                Dane produktu i ceny
              </h6>
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Nazwa / model *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold text-secondary">
                    Kod SKU *
                  </label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control bg-light text-dark"
                      value={formData.productCode}
                      disabled
                      readOnly
                      required
                    />
                    {!isEditMode && (
                      <button
                        type="button"
                        className="btn btn-outline-primary fw-semibold px-3"
                        onClick={handleGenerateSku}
                        disabled={!formData.name.trim()}
                      >
                        Generuj SKU
                      </button>
                    )}
                  </div>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">
                    Stan magazynowy{" "}
                    {isEditMode ? "(zablokowany)" : "(początkowy)"}
                  </label>
                  <input
                    type="number"
                    className="form-control bg-light text-muted"
                    value={formData.quantity}
                    disabled
                    readOnly
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">
                    Ostatnia cena zakupu z PZ
                  </label>
                  <div className="input-group">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control bg-light text-muted"
                      value={formData.purchasePrice}
                      disabled
                      readOnly
                    />
                    <span className="input-group-text">zł/szt.</span>
                  </div>
                  <small
                    className="text-muted d-block mt-1"
                    style={{ fontSize: "0.72rem" }}
                  >
                    Ostatnia cena z PZ.
                  </small>
                </div>

                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-secondary">
                    Średni koszt zapasu
                  </label>
                  <div className="input-group">
                    <input
                      type="number"
                      step="0.01"
                      className="form-control bg-light text-muted"
                      value={averageInventoryCost.toFixed(2)}
                      disabled
                      readOnly
                    />
                    <span className="input-group-text">zł/szt.</span>
                  </div>
                  <small
                    className="text-muted d-block mt-1"
                    style={{ fontSize: "0.72rem" }}
                  >
                    Średni koszt zakupu zapasu.
                  </small>
                </div>

                <div className="col-md-4">
                  <label className="form-label small fw-semibold text-primary">
                    Cena sprzedaży
                  </label>
                  <div className="input-group">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`form-control ${!isManager ? "bg-light text-muted" : "border-primary"}`}
                      value={formData.sellingPrice}
                      disabled={!isManager}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sellingPrice: e.target.value,
                        })
                      }
                      required
                    />
                    <span className="input-group-text">zł/szt.</span>
                  </div>
                  <small
                    className="text-muted d-block mt-1"
                    style={{ fontSize: "0.72rem" }}
                  >
                    {isManager
                      ? "Podstawowa cena sprzedaży."
                      : "Brak uprawnień do edycji cen."}
                  </small>
                </div>

                {isManager && marginInfo.isValid && (
                  <div className="col-12">
                    <div
                      className={`p-2 border rounded d-flex justify-content-between align-items-center small ${
                        marginInfo.isLoss
                          ? "bg-danger bg-opacity-10 border-danger text-danger"
                          : "bg-success bg-opacity-10 border-success text-success"
                      }`}
                    >
                      <span className="fw-semibold">
                        <i
                          className={`bi ${marginInfo.isLoss ? "bi-exclamation-triangle-fill" : "bi-graph-up-arrow"} me-1`}
                        ></i>
                        {marginInfo.isLoss
                          ? "Sprzedaż poniżej kosztu:"
                          : "Wynik na sztuce:"}
                      </span>
                      <span>
                        <strong>{marginInfo.profit} zł/szt.</strong> | Marża:{" "}
                        <strong>{marginInfo.margin}%</strong> | Narzut:{" "}
                        <strong>{marginInfo.markup}%</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-light rounded border">
                <h6 className="fw-bold text-dark mb-3 small text-uppercase">
                  Parametry techniczne ({activeCategory?.name || "Kategoria"})
                </h6>
                {dynamicFields.length === 0 ? (
                  <p className="text-muted small mb-0">
                    Brak zdefiniowanych parametrów dla tej kategorii.
                  </p>
                ) : (
                  <div className="row g-3">
                    {dynamicFields.map((field) => {
                      const value = formData.attributes[field.key] ?? "";
                      const isRequired = Boolean(field.required);

                      return (
                        <div className="col-md-6" key={field.key}>
                          <label className="form-label small fw-semibold text-secondary">
                            {field.label}{" "}
                            {isRequired && (
                              <span className="text-danger">*</span>
                            )}
                          </label>

                          {field.type === "select" ? (
                            <select
                              className="form-select form-select-sm"
                              value={value}
                              required={isRequired}
                              onChange={(e) =>
                                handleAttributeChange(field.key, e.target.value)
                              }
                            >
                              <option value="" disabled>
                                Wybierz opcję
                              </option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.type === "date" ? (
                            <input
                              type="date"
                              className="form-control form-control-sm"
                              value={value}
                              required={isRequired}
                              onChange={(e) =>
                                handleAttributeChange(field.key, e.target.value)
                              }
                            />
                          ) : field.unit ? (
                            <div className="input-group input-group-sm">
                              <input
                                type={
                                  field.type === "number" ? "number" : "text"
                                }
                                className="form-control"
                                value={value}
                                required={isRequired}
                                onChange={(e) =>
                                  handleAttributeChange(
                                    field.key,
                                    e.target.value,
                                  )
                                }
                              />
                              <span className="input-group-text bg-white text-muted">
                                {field.unit}
                              </span>
                            </div>
                          ) : (
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              className="form-control form-control-sm"
                              value={value}
                              required={isRequired}
                              onChange={(e) =>
                                handleAttributeChange(field.key, e.target.value)
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer bg-light py-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Anuluj
              </button>
              <button type="submit" className="btn btn-primary fw-bold px-4">
                {isEditMode ? "Zapisz zmiany" : "Zapisz zasób"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
