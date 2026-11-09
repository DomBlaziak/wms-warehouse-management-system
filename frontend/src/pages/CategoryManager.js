import React, { useState, useEffect } from "react";
import API from "../api/axios";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const generateSlugKey = (label) => {
  if (!label) return `attr_${Date.now()}`;
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/ą/g, "a")
      .replace(/ć/g, "c")
      .replace(/ę/g, "e")
      .replace(/ł/g, "l")
      .replace(/ń/g, "n")
      .replace(/ó/g, "o")
      .replace(/ś/g, "s")
      .replace(/ź/g, "z")
      .replace(/ż/g, "z")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || `attr_${Date.now()}`
  );
};

const CategoryManager = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState([]);

  const [newOptionInputs, setNewOptionInputs] = useState({});

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState(null);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await API.get("/categories");
      setCategories(res.data || []);
      if (res.data.length > 0 && !selectedCatId) {
        handleSelectCategory(res.data[0]);
      } else if (selectedCatId && selectedCatId !== "NEW") {
        const updatedCat = res.data.find((c) => c.id === selectedCatId);
        if (updatedCat) handleSelectCategory(updatedCat);
      }
    } catch {
      setError("Nie udało się pobrać kategorii z serwera.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCategory = (cat) => {
    setError("");
    setSuccess("");
    setNewOptionInputs({});

    if (cat === "NEW") {
      setSelectedCatId("NEW");
      setName("");
      setDescription("");
      setFields([]);
    } else {
      setSelectedCatId(cat.id);
      setName(cat.name);
      setDescription(cat.description || "");

      let parsedFields = [];
      try {
        parsedFields = Array.isArray(cat.required_attributes)
          ? cat.required_attributes
          : JSON.parse(cat.required_attributes || "[]");
      } catch {
        parsedFields = [];
      }

      setFields(
        parsedFields.map((f) => ({
          ...f,
          required: f.required !== false,
          isNew: false,
        })),
      );
    }
  };

  const handleAddField = () => {
    setFields([
      ...fields,
      {
        key: `attr_${Date.now()}`,
        label: "",
        type: "text",
        unit: "",
        options: [],
        required: true,
        isNew: true,
      },
    ]);
  };

  const handleRemoveField = (index) => {
    const field = fields[index];
    if (!field) return;
    setFieldToDelete({ index, label: field.label || "Bez nazwy" });
  };

  const handleConfirmRemoveField = () => {
    if (!fieldToDelete) return;
    setFields(fields.filter((_, i) => i !== fieldToDelete.index));
    setFieldToDelete(null);
  };

  // Niezawodne sortowanie bez zacinania i skoków layoutu
  const handleMoveField = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const updated = [...fields];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setFields(updated);
  };

  const handleFieldChange = (index, property, value) => {
    const updated = [...fields];
    updated[index][property] = value;

    if (property === "type") {
      if (value === "select") {
        updated[index].unit = "";
      } else if (value === "date") {
        updated[index].unit = "";
        updated[index].options = [];
      } else {
        updated[index].options = [];
      }
    }

    setFields(updated);
  };

  const handleAddOption = (fieldIndex) => {
    const optionText = (newOptionInputs[fieldIndex] || "").trim();
    if (!optionText) return;

    const updated = [...fields];
    const currentOptions = updated[fieldIndex].options || [];

    if (!currentOptions.includes(optionText)) {
      updated[fieldIndex].options = [...currentOptions, optionText];
      setFields(updated);
    }

    setNewOptionInputs({ ...newOptionInputs, [fieldIndex]: "" });
  };

  const handleRemoveOption = (fieldIndex, optToRemove) => {
    const updated = [...fields];
    updated[fieldIndex].options = (updated[fieldIndex].options || []).filter(
      (opt) => opt !== optToRemove,
    );
    setFields(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      return setError("Nazwa kategorii jest wymagana.");
    }

    const usedKeys = new Set();
    const preparedFields = fields.map((f) => {
      let finalKey = f.key;

      if (!finalKey || f.isNew || finalKey.startsWith("attr_")) {
        finalKey = generateSlugKey(f.label);
      }

      let uniqueKey = finalKey;
      let counter = 1;
      while (usedKeys.has(uniqueKey)) {
        uniqueKey = `${finalKey}_${counter}`;
        counter++;
      }
      usedKeys.add(uniqueKey);

      return {
        key: uniqueKey,
        label: f.label.trim(),
        type: f.type,
        unit:
          f.type === "select" || f.type === "date"
            ? ""
            : f.unit
              ? f.unit.trim()
              : "",
        options: f.type === "select" ? f.options || [] : [],
        required: Boolean(f.required),
      };
    });

    for (let i = 0; i < preparedFields.length; i++) {
      if (!preparedFields[i].label) {
        return setError(`Parametr #${i + 1} nie posiada nazwy etykiety.`);
      }
      if (
        preparedFields[i].type === "select" &&
        preparedFields[i].options.length === 0
      ) {
        return setError(
          `Parametr "${preparedFields[i].label}" ma typ lista wyboru, ale nie dodano żadnych opcji.`,
        );
      }
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      requiredAttributes: preparedFields,
    };

    try {
      setIsSubmitting(true);
      if (selectedCatId === "NEW") {
        await API.post("/categories", payload);
        setSuccess("Utworzono nową kategorię systemową.");
        setSelectedCatId(null);
      } else {
        await API.put(`/categories/${selectedCatId}`, payload);
        setSuccess("Pomyślnie zaktualizowano kategorię.");
      }
      await fetchCategories();
    } catch (err) {
      setError(err.response?.data?.message || "Wystąpił błąd zapisu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedCatId === "NEW") return;
    setError("");
    try {
      setIsSubmitting(true);
      await API.delete(`/categories/${selectedCatId}`);
      setSelectedCatId(null);
      setShowDeleteModal(false);
      await fetchCategories();
      setSuccess("Kategoria została zarchiwizowana.");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Nie udało się usunąć kategorii. Prawdopodobnie posiada przypisane produkty.",
      );
      setShowDeleteModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">Ładowanie panelu kategorii...</div>
    );
  }

  return (
    <div
      className="container-fluid py-4 px-4"
      style={{ background: "#f8fbff", minHeight: "100vh" }}
    >
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold text-dark mb-1">
            <i className="bi bi-diagram-3-fill text-primary me-2"></i>Słowniki
            Kategorii i Pól JSONB
          </h3>
          <small className="text-muted">
            Konfiguracja grup asortymentowych oraz schematów specyfikacji
            technicznej
          </small>
        </div>
      </div>

      <div className="row g-4">
        {/* LEWA STRONA - LISTA KATEGORII */}
        <div className="col-md-3">
          <div className="card shadow-sm border-0 p-3 bg-white h-100">
            <button
              className={`btn w-100 fw-bold mb-3 ${
                selectedCatId === "NEW" ? "btn-primary" : "btn-outline-primary"
              }`}
              onClick={() => handleSelectCategory("NEW")}
            >
              <i className="bi bi-plus-lg me-1"></i> Dodaj nową kategorię
            </button>
            <h6 className="fw-bold small text-muted text-uppercase mb-2">
              Dostępne Kategorie
            </h6>
            <div className="list-group list-group-flush">
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`list-group-item list-group-item-action border-0 rounded mb-1 px-3 py-2 ${
                    selectedCatId === c.id
                      ? "bg-primary text-white fw-semibold shadow-sm"
                      : "bg-light text-dark"
                  }`}
                  onClick={() => handleSelectCategory(c)}
                >
                  <i className="bi bi-folder2 me-2"></i> {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* PRAWA STRONA - EDYTOR */}
        <div className="col-md-9">
          <div className="card shadow-sm border-0 bg-white h-100">
            <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
              <h5 className="mb-0 fw-bold text-dark">
                {selectedCatId === "NEW"
                  ? "Tworzenie nowej kategorii"
                  : `Edycja kategorii: ${name}`}
              </h5>
              {selectedCatId !== "NEW" && (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={isSubmitting}
                >
                  <i className="bi bi-trash me-1"></i> Usuń kategorię
                </button>
              )}
            </div>

            <div className="card-body p-4">
              {error && (
                <div className="alert alert-danger py-2 small fw-semibold">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {error}
                </div>
              )}
              {success && (
                <div className="alert alert-success py-2 small fw-semibold">
                  <i className="bi bi-check-circle-fill me-2"></i>
                  {success}
                </div>
              )}

              <form onSubmit={handleSave}>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold text-secondary">
                      Nazwa kategorii *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="np. Urządzenia Sieciowe"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold text-secondary">
                      Opis przeznaczenia
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="np. Routery, switche i osprzęt sieciowy"
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center border-top pt-4 mb-3">
                  <div>
                    <h6 className="fw-bold mb-0 text-dark">
                      Pola specyfikacji technicznej
                    </h6>
                    <small className="text-muted">
                      Użyj strzałek ▲ / ▼, aby uporządkować kolejność pól w
                      formularzu
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-primary fw-semibold btn-sm"
                    onClick={handleAddField}
                  >
                    <i className="bi bi-plus-lg me-1"></i> Dodaj parametr
                  </button>
                </div>

                <div
                  className="bg-light p-3 rounded border"
                  style={{ minHeight: "220px" }}
                >
                  {fields.length === 0 ? (
                    <div className="text-center text-muted py-5 small">
                      Brak zdefiniowanych parametrów. Kliknij{" "}
                      <strong>"+ Dodaj parametr"</strong>, aby dodać pole.
                    </div>
                  ) : (
                    fields.map((field, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-3 rounded border mb-3 shadow-sm"
                      >
                        <div className="row g-2 align-items-center">
                          {/* Estetyczne, powiększone strzałki sortowania */}
                          <div className="col-auto pe-2">
                            <div
                              className="btn-group-vertical shadow-sm"
                              role="group"
                              aria-label="Sortowanie parametru"
                            >
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary py-1 px-2 d-flex align-items-center justify-content-center"
                                style={{
                                  width: "32px",
                                  height: "26px",
                                  backgroundColor:
                                    idx === 0 ? "#f8f9fa" : "#ffffff",
                                  borderColor: "#dee2e6",
                                }}
                                disabled={idx === 0}
                                onClick={() => handleMoveField(idx, -1)}
                                title="Przesuń parametr w górę"
                              >
                                <i
                                  className="bi bi-chevron-up fw-bold"
                                  style={{ fontSize: "0.85rem" }}
                                ></i>
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary py-1 px-2 d-flex align-items-center justify-content-center"
                                style={{
                                  width: "32px",
                                  height: "26px",
                                  backgroundColor:
                                    idx === fields.length - 1
                                      ? "#f8f9fa"
                                      : "#ffffff",
                                  borderColor: "#dee2e6",
                                }}
                                disabled={idx === fields.length - 1}
                                onClick={() => handleMoveField(idx, 1)}
                                title="Przesuń parametr w dół"
                              >
                                <i
                                  className="bi bi-chevron-down fw-bold"
                                  style={{ fontSize: "0.85rem" }}
                                ></i>
                              </button>
                            </div>
                          </div>

                          {/* 1. Nazwa cechy */}
                          <div className="col-md-4">
                            <label className="small fw-semibold text-secondary mb-1">
                              Nazwa parametru *
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="np. Przepustowość"
                              value={field.label}
                              onChange={(e) =>
                                handleFieldChange(idx, "label", e.target.value)
                              }
                              required
                            />
                          </div>

                          {/* 2. Typ pola */}
                          <div className="col-md-3">
                            <label className="small fw-semibold text-secondary mb-1">
                              Typ wartości{" "}
                              {!field.isNew && (
                                <small className="text-muted">(stały)</small>
                              )}
                            </label>
                            <select
                              className="form-select form-select-sm"
                              value={field.type}
                              disabled={!field.isNew}
                              onChange={(e) =>
                                handleFieldChange(idx, "type", e.target.value)
                              }
                              title={
                                !field.isNew
                                  ? "Typ istniejącego pola jest zablokowany, by chronić spójność produktów w bazie"
                                  : ""
                              }
                            >
                              <option value="text">Dowolny tekst</option>
                              <option value="number">Liczba</option>
                              <option value="select">
                                Lista wyboru (Warianty)
                              </option>
                              <option value="date">Data (Kalendarz)</option>
                            </select>
                          </div>

                          {/* 3. Jednostka miary */}
                          <div className="col-md-2">
                            <label className="small fw-semibold text-secondary mb-1">
                              Jednostka
                            </label>
                            <input
                              type="text"
                              list="common-units"
                              className={`form-control form-control-sm ${
                                field.type === "select" || field.type === "date"
                                  ? "bg-light text-muted"
                                  : ""
                              }`}
                              placeholder={
                                field.type === "select"
                                  ? "W opcjach"
                                  : field.type === "date"
                                    ? "Brak"
                                    : "np. W, GB"
                              }
                              value={field.unit || ""}
                              disabled={
                                field.type === "select" || field.type === "date"
                              }
                              onChange={(e) =>
                                handleFieldChange(idx, "unit", e.target.value)
                              }
                            />
                          </div>

                          {/* 4. Przełącznik Wymagane */}
                          <div className="col-md-1 text-center">
                            <label className="small fw-semibold text-secondary mb-1 d-block">
                              Wymagane
                            </label>
                            <div className="form-check form-switch d-inline-block">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                role="switch"
                                checked={Boolean(field.required)}
                                onChange={(e) =>
                                  handleFieldChange(
                                    idx,
                                    "required",
                                    e.target.checked,
                                  )
                                }
                              />
                            </div>
                          </div>

                          {/* 5. Usuwanie */}
                          <div className="col-md-1 text-end pt-3">
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleRemoveField(idx)}
                              title="Usuń ten parametr po potwierdzeniu"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </div>

                        {/* Warianty dla listy wyboru */}
                        {field.type === "select" && (
                          <div className="mt-3 pt-3 border-top">
                            <label className="small fw-semibold text-secondary d-block mb-2">
                              Warianty do wyboru w liście rozwijanej:
                            </label>

                            <div className="d-flex flex-wrap gap-2 mb-2">
                              {(field.options || []).length === 0 ? (
                                <span className="text-muted small fst-italic">
                                  Brak dodanych opcji. Wpisz wartość poniżej i
                                  zatwierdź Enterem.
                                </span>
                              ) : (
                                field.options.map((opt, optIdx) => (
                                  <span
                                    key={optIdx}
                                    className="badge bg-light text-dark border px-2 py-1 d-flex align-items-center gap-1 shadow-sm"
                                  >
                                    <span>{opt}</span>
                                    <button
                                      type="button"
                                      className="btn-close ms-1"
                                      style={{ fontSize: "0.55rem" }}
                                      onClick={() =>
                                        handleRemoveOption(idx, opt)
                                      }
                                      title="Usuń tę opcję"
                                    ></button>
                                  </span>
                                ))
                              )}
                            </div>

                            <div
                              className="input-group input-group-sm"
                              style={{ maxWidth: "420px" }}
                            >
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Wpisz wariant i naciśnij Enter"
                                value={newOptionInputs[idx] || ""}
                                onChange={(e) =>
                                  setNewOptionInputs({
                                    ...newOptionInputs,
                                    [idx]: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddOption(idx);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="btn btn-outline-primary"
                                onClick={() => handleAddOption(idx)}
                              >
                                + Dodaj wariant
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 text-end">
                  <button
                    type="submit"
                    className="btn btn-dark fw-bold px-5 py-2 shadow-sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? "Zapisywanie..."
                      : "Zapisz konfigurację kategorii"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Usunięcie Kategorii"
          itemText={`Kategoria: ${name}`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {fieldToDelete && (
        <ConfirmDeleteModal
          title="Usunięcie pola kategorii"
          itemText={`Parametr: ${fieldToDelete.label}`}
          message="Czy na pewno chcesz usunąć to pole z konfiguracji kategorii?"
          warning="Zmiana zostanie zastosowana po zapisaniu konfiguracji. Wcześniej zapisane dane produktów pozostaną w bazie, ale usunięte pole nie będzie już widoczne."
          onConfirm={handleConfirmRemoveField}
          onCancel={() => setFieldToDelete(null)}
        />
      )}

      <datalist id="common-units">
        <option value="szt." label="[szt.] Ilość / Liczba elementów" />
        <option value="ark." label="[ark.] Liczba arkuszy" />
        <option
          value="str./min"
          label="[str./min] Tempo / Wydajność na minutę"
        />
        <option value="dpi" label="[dpi] Rozdzielczość / Gęstość" />
        <option value="GB" label="[GB] Pojemność danych (gigabajty)" />
        <option value="TB" label="[TB] Pojemność danych (terabajty)" />
        <option value="Hz" label="[Hz] Częstotliwość pracy" />
        <option value="cal" label="[cal] Przekątna / Rozmiar" />
        <option value="W" label="[W] Moc znamionowa" />
        <option value="V" label="[V] Napięcie zasilania" />
        <option value="mAh" label="[mAh] Pojemność akumulatora" />
        <option value="kg" label="[kg] Masa / Waga" />
        <option value="m" label="[m] Długość / Odległość" />
        <option value="mm" label="[mm] Wymiary precyzyjne" />
      </datalist>
    </div>
  );
};

export default CategoryManager;
