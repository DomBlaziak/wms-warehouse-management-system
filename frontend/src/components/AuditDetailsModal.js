import React from "react";

const formatCurrency = (val) =>
  Number(val || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Słownik tylko dla kluczowych pól relacyjnych tabeli products
const baseFieldDictionary = {
  name: "Nazwa / model",
  product_code: "Kod SKU",
  quantity: "Stan magazynowy",
  purchase_price: "Cena zakupu",
  selling_price: "Cena sprzedaży",
  price: "Cena bazowa",
  role_name: "Rola systemowa",
  first_name: "Imię",
  last_name: "Nazwisko",
  username: "Login",
};

/**
 * Dynamiczna funkcja pobierająca etykietę pola z definicji kategorii lub słownika bazowego.
 */
const formatKeyName = (key, categoryId, categories = []) => {
  if (baseFieldDictionary[key]) {
    return baseFieldDictionary[key];
  }

  if (key === "category_id" || key === "categoryId") {
    return "Kategoria sprzętu";
  }

  const category = categories.find((c) => String(c.id) === String(categoryId));
  if (category && category.required_attributes) {
    let fields = [];
    try {
      fields = Array.isArray(category.required_attributes)
        ? category.required_attributes
        : JSON.parse(category.required_attributes || "[]");
    } catch {
      fields = [];
    }

    const foundField = fields.find((f) => f.key === key);
    if (foundField?.label) {
      return foundField.label;
    }
  }

  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatValue = (key, val, categories = []) => {
  if (val === undefined || val === null || val === "")
    return <span className="text-muted fst-italic">Brak</span>;

  if (
    key === "category_id" ||
    key === "categoryId" ||
    key === "Kategoria sprzętu"
  ) {
    const foundCat = categories.find((c) => String(c.id) === String(val));
    return (
      <span className="fw-semibold text-primary">
        {foundCat ? foundCat.name : `Nieznana kategoria (ID: ${val})`}
      </span>
    );
  }

  if (key === "purchase_price" || key === "selling_price" || key === "price") {
    return <span>{formatCurrency(val)} zł</span>;
  }

  if (key === "quantity") {
    return <span>{val} szt.</span>;
  }

  if (typeof val === "object") {
    return (
      <pre className="mb-0 small bg-light p-1 rounded text-break">
        {JSON.stringify(val, null, 2)}
      </pre>
    );
  }

  return <span className="text-break">{String(val)}</span>;
};

const getCategoryFields = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (field) =>
      field && typeof field === "object" && typeof field.key === "string",
  );
};

const formatCategoryField = (field) => {
  if (!field) return "Brak";
  const parts = [
    field.label || field.key,
    field.type ? `typ: ${field.type}` : null,
    field.required ? "wymagane" : "opcjonalne",
    field.unit ? `jednostka: ${field.unit}` : null,
    field.type === "select" && Array.isArray(field.options)
      ? `opcje: ${field.options.join(", ")}`
      : null,
  ].filter(Boolean);
  return parts.join(" | ");
};

const AuditDetailsModal = ({ auditLog, categories = [], onClose }) => {
  if (!auditLog) return null;

  const isCreate = auditLog.action === "CREATE" || auditLog.action === "INSERT";
  const isDelete = auditLog.action === "DELETE";
  const isRoleChange = auditLog.action === "USER_ROLE_CHANGED";

  // Dynamiczny wybór klasy kolorystycznej dla nagłówka modalu
  const headerBgClass = isCreate
    ? "bg-success"
    : isDelete
      ? "bg-danger"
      : "bg-primary";

  const getActionLabel = (action) => {
    if (action === "USER_ROLE_CHANGED") return "Zmiana roli użytkownika";

    const entityLabels = {
      PRODUCT: "produktu",
      CATEGORY: "kategorii",
      USER: "użytkownika",
    };
    const entityLabel = entityLabels[auditLog.entity_type] || "zasobu";

    switch (action?.toUpperCase()) {
      case "CREATE":
      case "INSERT":
        return `Utworzenie ${entityLabel}`;
      case "UPDATE":
        return `Edycja ${entityLabel}`;
      case "DELETE":
        return `Usunięcie ${entityLabel}`;
      default:
        return `Zdarzenie: ${action}`;
    }
  };
  const oldData = auditLog.old_data || {};
  const newData = auditLog.new_data || {};
  const isCategory = auditLog.entity_type === "CATEGORY";
  const oldCategoryFields = getCategoryFields(oldData.required_attributes);
  const newCategoryFields = getCategoryFields(newData.required_attributes);
  const entityLabels = {
    PRODUCT: "produktu",
    CATEGORY: "kategorii",
    USER: "użytkownika",
  };
  const entityLabel = entityLabels[auditLog.entity_type] || "zasób";

  const productCategoryId =
    newData.category_id || oldData.category_id || auditLog.category_id;

  const oldAttrs = oldData.attributes || {};
  const newAttrs = newData.attributes || {};

  const { attributes: _oldA, ...cleanOldData } = oldData;
  const { attributes: _newA, ...cleanNewData } = newData;

  const ignoredKeys = [
    "updated_at",
    "created_at",
    "id",
    "attributes",
    "category_id",
    "required_attributes",
    ...(oldData.role_name || newData.role_name ? ["role_id"] : []),
  ];

  const targetData = isDelete ? cleanOldData : cleanNewData;
  const targetAttrs = isDelete ? oldAttrs : newAttrs;

  const mainKeys = Object.keys(targetData).filter(
    (key) =>
      !ignoredKeys.includes(key) &&
      targetData[key] !== undefined &&
      targetData[key] !== "",
  );
  const attrKeys = Object.keys(targetAttrs);

  const categoryFieldKeys = Array.from(
    new Set([
      ...oldCategoryFields.map((field) => field.key),
      ...newCategoryFields.map((field) => field.key),
    ]),
  );

  const createDeleteKeys = [
    ...(productCategoryId ? ["category_id"] : []),
    ...mainKeys,
    ...attrKeys.map((k) => `attr_${k}`),
    ...(isCategory
      ? categoryFieldKeys.map((key) => `category_field_${key}`)
      : []),
  ];

  const allMainKeys = Array.from(
    new Set([...Object.keys(cleanOldData), ...Object.keys(cleanNewData)]),
  ).filter((key) => !ignoredKeys.includes(key));

  const oldCat = oldData.category_id;
  const newCat = newData.category_id;
  const categoryChanged = oldCat !== newCat && (oldCat || newCat);

  const allAttrKeys = Array.from(
    new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]),
  );

  const updateCombinedKeys = [
    ...(categoryChanged ? ["category_id"] : []),
    ...allMainKeys,
    ...allAttrKeys.map((k) => `attr_${k}`),
    ...(isCategory
      ? categoryFieldKeys.map((key) => `category_field_${key}`)
      : []),
  ];

  const changedKeys = (
    isCreate || isDelete ? createDeleteKeys : updateCombinedKeys
  ).filter((compositeKey) => {
    if (isCreate || isDelete) return true;
    if (compositeKey === "category_id") return true;

    const isAttr = compositeKey.startsWith("attr_");
    const isCategoryField = compositeKey.startsWith("category_field_");
    if (isCategoryField) {
      const fieldKey = compositeKey.replace("category_field_", "");
      const oldField = oldCategoryFields.find(
        (field) => field.key === fieldKey,
      );
      const newField = newCategoryFields.find(
        (field) => field.key === fieldKey,
      );
      return JSON.stringify(oldField) !== JSON.stringify(newField);
    }
    const realKey = isAttr ? compositeKey.replace("attr_", "") : compositeKey;

    const oldVal = isAttr ? oldAttrs[realKey] : cleanOldData[realKey];
    const newVal = isAttr ? newAttrs[realKey] : cleanNewData[realKey];

    return JSON.stringify(oldVal) !== JSON.stringify(newVal);
  });

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content border-0 shadow-lg">
          {/* Dynamiczny kolor i polski opis akcji w nagłówku */}
          <div className={`modal-header ${headerBgClass} text-white py-3`}>
            <h5 className="modal-title fw-bold fs-6 mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-clock-history"></i>{" "}
              {getActionLabel(auditLog.action)}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body p-4">
            {/* Metadane akcji */}
            <div className="bg-light p-3 rounded mb-4 small border d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <span
                  className="text-muted d-block"
                  style={{ fontSize: "0.75rem" }}
                >
                  Operator akcji:
                </span>
                <strong className="fs-6 text-dark">
                  {auditLog.username || "System"}
                </strong>
              </div>
              <div>
                <span
                  className="text-muted d-block"
                  style={{ fontSize: "0.75rem" }}
                >
                  Dotyczy zasobu:
                </span>
                <strong className="fs-6 text-primary">
                  {auditLog.current_product_name ||
                    newData.name ||
                    oldData.name ||
                    newData.username ||
                    oldData.username ||
                    entityLabel}
                </strong>
              </div>
              <div className="text-md-end">
                <span
                  className="text-muted d-block"
                  style={{ fontSize: "0.75rem" }}
                >
                  Data rejestracji:
                </span>
                <strong className="fs-6 text-dark">
                  {new Date(auditLog.changed_at).toLocaleString("pl-PL")}
                </strong>
              </div>
            </div>

            <h6 className="fw-bold text-dark small text-uppercase mb-3">
              {isRoleChange
                ? "Zmiana roli użytkownika:"
                : isCreate
                  ? "Wprowadzone dane zasobu:"
                  : isDelete
                    ? "Dane usuniętego zasobu:"
                    : "Zmodyfikowane właściwości i parametry:"}
            </h6>

            {changedKeys.length === 0 ? (
              <div className="alert alert-info py-2 small mb-0">
                Brak zarejestrowanych danych w tym wpisie.
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {changedKeys.map((compositeKey) => {
                  const isAttr = compositeKey.startsWith("attr_");
                  const isCategoryField =
                    compositeKey.startsWith("category_field_");
                  const realKey = isAttr
                    ? compositeKey.replace("attr_", "")
                    : isCategoryField
                      ? compositeKey.replace("category_field_", "")
                      : compositeKey;

                  const oldCategoryField = isCategoryField
                    ? oldCategoryFields.find((field) => field.key === realKey)
                    : null;
                  const newCategoryField = isCategoryField
                    ? newCategoryFields.find((field) => field.key === realKey)
                    : null;
                  const labelName = isCategoryField
                    ? newCategoryField?.label ||
                      oldCategoryField?.label ||
                      realKey
                    : formatKeyName(realKey, productCategoryId, categories);

                  // Układ dla CREATE / INSERT
                  if (isCreate) {
                    const val = isAttr
                      ? targetAttrs[realKey]
                      : isCategoryField
                        ? newCategoryField
                          ? formatCategoryField(newCategoryField)
                          : null
                        : compositeKey === "category_id"
                          ? productCategoryId
                          : targetData[realKey];
                    return (
                      <div
                        key={compositeKey}
                        className="p-3 border rounded bg-white shadow-sm d-flex justify-content-between align-items-center"
                      >
                        <div>
                          <div className="small fw-bold text-secondary mb-1">
                            {labelName}
                            {isAttr && (
                              <span
                                className="ms-2 badge bg-success text-white fw-semibold"
                                style={{ fontSize: "0.68rem" }}
                              >
                                Parametr techniczny
                              </span>
                            )}
                          </div>
                          <div className="text-dark fw-bold">
                            {formatValue(realKey, val, categories)}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Układ dla DELETE
                  if (isDelete) {
                    const val = isAttr
                      ? targetAttrs[realKey]
                      : isCategoryField
                        ? oldCategoryField
                          ? formatCategoryField(oldCategoryField)
                          : null
                        : compositeKey === "category_id"
                          ? productCategoryId
                          : targetData[realKey];
                    return (
                      <div
                        key={compositeKey}
                        className="p-3 border rounded bg-white shadow-sm d-flex justify-content-between align-items-center"
                      >
                        <div>
                          <div className="small fw-bold text-secondary mb-1">
                            {labelName}
                            {isAttr && (
                              <span
                                className="ms-2 badge bg-secondary text-white fw-semibold"
                                style={{ fontSize: "0.68rem" }}
                              >
                                Parametr techniczny
                              </span>
                            )}
                          </div>
                          <div className="text-muted">
                            {formatValue(realKey, val, categories)}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Układ dla UPDATE (Przed -> Po)
                  const oldVal = isAttr
                    ? oldAttrs[realKey]
                    : isCategoryField
                      ? oldCategoryField
                        ? formatCategoryField(oldCategoryField)
                        : null
                      : compositeKey === "category_id"
                        ? oldCat
                        : cleanOldData[realKey];
                  const newVal = isAttr
                    ? newAttrs[realKey]
                    : isCategoryField
                      ? newCategoryField
                        ? formatCategoryField(newCategoryField)
                        : null
                      : compositeKey === "category_id"
                        ? newCat
                        : cleanNewData[realKey];

                  return (
                    <div
                      key={compositeKey}
                      className="p-3 border rounded bg-white shadow-sm"
                    >
                      <div className="fw-bold text-dark small mb-2 border-bottom pb-1 d-flex justify-content-between align-items-center">
                        <span>
                          {labelName}
                          {isAttr && (
                            <span
                              className="ms-2 badge bg-primary text-white fw-semibold"
                              style={{ fontSize: "0.68rem" }}
                            >
                              Parametr techniczny
                            </span>
                          )}
                        </span>
                        <span
                          className="badge bg-warning text-dark fw-bold border border-warning"
                          style={{ fontSize: "0.7rem" }}
                        >
                          Zmieniono
                        </span>
                      </div>
                      <div className="row g-2 align-items-center small">
                        <div className="col-12 col-md-5 border-end-md pe-md-3">
                          <span
                            className="text-muted d-block"
                            style={{ fontSize: "0.7rem" }}
                          >
                            Przed zmianą:
                          </span>
                          <div className="text-danger text-decoration-line-through mt-1">
                            {formatValue(realKey, oldVal, categories)}
                          </div>
                        </div>
                        <div className="col-1 text-center d-none d-md-block text-muted">
                          <i className="bi bi-arrow-right fw-bold"></i>
                        </div>
                        <div className="col-12 col-md-6 ps-md-2">
                          <span
                            className="text-muted d-block"
                            style={{ fontSize: "0.7rem" }}
                          >
                            Po zmianie:
                          </span>
                          <div className="text-success fw-bold mt-1">
                            {formatValue(realKey, newVal, categories)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-header bg-light py-2 justify-content-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm px-4 fw-semibold"
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

export default AuditDetailsModal;
