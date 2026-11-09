import React from "react";

const formatCurrency = (val) =>
  Number(val || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const ProductDetailsModal = ({ product, categories = [], onClose }) => {
  if (!product) return null;
  const category = categories.find(
    (c) => String(c.id) === String(product.category_id),
  );
  const categoryName = category?.name || product.category_name || "Sprzęt IT";

  let categoryFields = [];
  try {
    categoryFields = Array.isArray(category?.required_attributes)
      ? category.required_attributes
      : JSON.parse(category?.required_attributes || "[]");
  } catch {
    categoryFields = [];
  }

  const attributes = product.attributes || {};
  const attributeEntries = Object.entries(attributes);

  const purchasePrice = Number(product.purchase_price ?? product.price ?? 0);
  const sellingPrice = Number(product.selling_price ?? product.price ?? 0);
  const quantity = Number(product.quantity || 0);

  const getFieldInfo = (key, val) => {
    const fieldDef = categoryFields.find((f) => f.key === key);
    const label =
      fieldDef?.label ||
      key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (val === null || val === undefined || val === "")
      return { label, value: "—" };
    const stringVal =
      typeof val === "object" ? JSON.stringify(val) : String(val);
    return {
      label,
      value: fieldDef?.unit ? `${stringVal} ${fieldDef.unit}` : stringVal,
    };
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-primary text-white py-3">
            <h5 className="modal-title fw-bold fs-6 mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-info-circle-fill"></i> Karta Zasobu:{" "}
              {product.name}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body p-4">
            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <div className="p-2 border rounded bg-light text-center h-100 d-flex flex-column justify-content-center">
                  <small
                    className="text-muted d-block"
                    style={{ fontSize: "0.75rem" }}
                  >
                    Kod SKU
                  </small>
                  <strong className="text-dark fs-6">
                    {product.product_code || "—"}
                  </strong>
                </div>
              </div>
              <div className="col-md-3">
                <div className="p-2 border rounded bg-light text-center h-100 d-flex flex-column justify-content-center">
                  <small
                    className="text-muted d-block"
                    style={{ fontSize: "0.75rem" }}
                  >
                    Kategoria / stan magazynowy
                  </small>
                  <strong className="text-primary fs-6">{categoryName}</strong>
                  <small className="text-dark fw-bold">{quantity} szt.</small>
                </div>
              </div>
              <div className="col-md-6">
                {/* Nowy, równorzędny układ cen */}
                <div className="p-2 border rounded bg-light d-flex justify-content-around align-items-center h-100">
                  <div className="text-center">
                    <small
                      className="text-muted d-block"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Ostatnia cena zakupu z PZ
                    </small>
                    <strong className="text-dark fs-6">
                      {formatCurrency(purchasePrice)} zł/szt.
                    </strong>
                  </div>
                  <div className="border-end h-75 mx-2"></div>
                  <div className="text-center">
                    <small
                      className="text-muted d-block"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Cena sprzedaży
                    </small>
                    <strong className="text-success fs-6">
                      {formatCurrency(sellingPrice)} zł/szt.
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="border rounded overflow-hidden">
              <div className="bg-light px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                <span className="fw-bold text-dark small text-uppercase">
                  Parametry techniczne produktu
                </span>
                <span className="badge bg-primary bg-opacity-10 text-primary border">
                  Atrybuty: {attributeEntries.length}
                </span>
              </div>
              {attributeEntries.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  Brak parametrów w bazie.
                </div>
              ) : (
                <table className="table table-sm table-hover mb-0 align-middle">
                  <tbody>
                    {attributeEntries.map(([key, value]) => {
                      const { label, value: displayVal } = getFieldInfo(
                        key,
                        value,
                      );
                      return (
                        <tr key={key}>
                          <td
                            className="ps-3 text-secondary fw-semibold"
                            style={{ width: "40%" }}
                          >
                            {label}
                          </td>
                          <td className="pe-3 text-dark fw-bold">
                            {displayVal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="modal-footer bg-light py-2">
            <button
              type="button"
              className="btn btn-secondary px-4 fw-semibold btn-sm"
              onClick={onClose}
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ProductDetailsModal;
