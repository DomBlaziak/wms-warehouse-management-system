import React, { useState, useMemo } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getInventoryCostSummary } from "../utils/inventoryCost";

const sanitizeText = (str) => {
  return str ? String(str) : "";
};

const loadPdfFonts = async (doc) => {
  const fontFiles = [
    ["Arial.ttf", "normal"],
    ["Arial-Bold.ttf", "bold"],
  ];

  for (const [fileName, style] of fontFiles) {
    const response = await fetch(
      `${process.env.PUBLIC_URL || ""}/fonts/${fileName}`,
    );
    if (!response.ok) {
      throw new Error(`Nie udało się pobrać fontu PDF: ${fileName}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(index, index + chunkSize),
      );
    }

    doc.addFileToVFS(fileName, binary);
    doc.addFont(fileName, "Arial", style);
  }
};

const formatCurrency = (val) =>
  Number(val || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const drawAppLogo = (doc, x, y) => {
  doc.setFillColor(13, 110, 253);
  doc.roundedRect(x, y, 12, 12, 2.5, 2.5, "F");

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.7);
  doc.rect(x + 2.5, y + 2.5, 7, 7);
  doc.line(x + 2.5, y + 6, x + 9.5, y + 6);
  doc.line(x + 6, y + 6, x + 6, y + 9.5);
};

const ExportPdfModal = ({
  products,
  categories,
  movements = [],
  currentUser,
  onClose,
}) => {
  const [selectedProductIds, setSelectedProductIds] = useState(
    products.map((p) => String(p.id)),
  );

  const [expandedCategories, setExpandedCategories] = useState(
    categories.reduce((acc, cat) => ({ ...acc, [cat.id]: true }), {}),
  );

  const productsByCategory = useMemo(() => {
    const grouped = {};
    categories.forEach((cat) => {
      grouped[cat.id] = products.filter(
        (p) => String(p.category_id) === String(cat.id),
      );
    });
    return grouped;
  }, [products, categories]);

  const handleToggleCategory = (catId) => {
    const catProductIds = (productsByCategory[catId] || []).map((p) =>
      String(p.id),
    );
    const allSelected = catProductIds.every((id) =>
      selectedProductIds.includes(id),
    );

    if (allSelected) {
      setSelectedProductIds(
        selectedProductIds.filter((id) => !catProductIds.includes(id)),
      );
    } else {
      setSelectedProductIds(
        Array.from(new Set([...selectedProductIds, ...catProductIds])),
      );
    }
  };

  const handleToggleProduct = (productId) => {
    const pIdStr = String(productId);
    setSelectedProductIds((prev) =>
      prev.includes(pIdStr)
        ? prev.filter((id) => id !== pIdStr)
        : [...prev, pIdStr],
    );
  };

  const toggleExpand = (catId) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const selectedProducts = useMemo(() => {
    return products
      .filter((p) => selectedProductIds.includes(String(p.id)))
      .sort((a, b) => Number(a.category_id) - Number(b.category_id));
  }, [products, selectedProductIds]);

  const inventorySummaries = useMemo(() => {
    const summaries = {};
    products.forEach((product) => {
      summaries[product.id] = getInventoryCostSummary(
        product,
        movements.filter(
          (movement) => String(movement.product_id) === String(product.id),
        ),
      );
    });
    return summaries;
  }, [products, movements]);

  const selectedTotalValue = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) =>
        sum +
        Number(p.selling_price ?? p.price ?? 0) *
          (inventorySummaries[p.id]?.quantity || 0),
      0,
    );
  }, [selectedProducts, inventorySummaries]);

  const selectedTotalQuantity = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) => sum + (inventorySummaries[p.id]?.quantity || 0),
      0,
    );
  }, [selectedProducts, inventorySummaries]);

  const generatePDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      await loadPdfFonts(doc);
      doc.setFont("Arial", "normal");

      drawAppLogo(doc, 14, 13);

      doc.setFont("Arial", "bold");
      doc.setFontSize(15);
      doc.setTextColor(13, 110, 253);
      doc.text(
        sanitizeText("SmartInventory - Raport Stanu Magazynowego"),
        29,
        19,
      );

      doc.setFont("Arial", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(108, 117, 125);

      const dateStr = new Date().toLocaleString("pl-PL");
      const authorName = currentUser
        ? `${currentUser.firstName || currentUser.first_name || ""} ${currentUser.lastName || currentUser.last_name || currentUser.username}`.trim()
        : "Pracownik";
      const roleName =
        currentUser?.roleName || currentUser?.role_name || "Uzytkownik";

      doc.text(sanitizeText(`Data raportu: ${dateStr}`), 29, 24);
      doc.text(
        sanitizeText(`Autor: ${authorName} (Rola: ${roleName})`),
        125,
        24,
      );

      doc.setDrawColor(220, 224, 230);
      doc.setLineWidth(0.4);
      doc.line(14, 30, 196, 30);

      const tableHeaders = [
        [
          "Lp.",
          "Produkt / Model",
          "Kod SKU",
          "Kategoria",
          "Ilość",
          "Cena sprzedaży (zł)",
          "Wartość wg ceny sprzedaży (zł)",
        ],
      ];

      const tableRows = selectedProducts.map((p, index) => {
        const catName =
          categories.find((c) => String(c.id) === String(p.category_id))
            ?.name || "Inne";
        const sellPrice = Number(p.selling_price ?? p.price ?? 0);
        const quantity = inventorySummaries[p.id]?.quantity || 0;
        const itemVal = (sellPrice * quantity).toFixed(2);

        return [
          index + 1,
          sanitizeText(p.name),
          sanitizeText(p.product_code || "—"),
          sanitizeText(catName),
          `${quantity} szt.`,
          formatCurrency(sellPrice),
          formatCurrency(itemVal),
        ];
      });

      autoTable(doc, {
        startY: 34,
        head: tableHeaders,
        body: tableRows,
        theme: "striped",
        headStyles: {
          fillColor: [13, 110, 253],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "center",
        },
        styles: {
          font: "Arial",
          fontSize: 8,
          cellPadding: 2.2,
          textColor: [33, 37, 41],
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { halign: "left" },
          2: { cellWidth: 28, halign: "center" },
          3: { cellWidth: 32, halign: "center" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 24, halign: "right" },
          6: { cellWidth: 28, halign: "right", fontStyle: "bold" },
        },
      });

      const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 34) + 6;

      if (finalY > 250) {
        doc.addPage();
      }

      const boxY = finalY > 250 ? 15 : finalY;

      doc.setFillColor(248, 249, 250);
      doc.setDrawColor(222, 226, 230);
      doc.roundedRect(14, boxY, 182, 38, 2, 2, "FD");
      doc.setFillColor(13, 110, 253);
      doc.roundedRect(14, boxY, 3, 38, 1, 1, "F");

      const summaryRows = [
        ["Liczba modeli w asortymencie", `${selectedProducts.length}`],
        ["Łączny stan magazynowy", `${selectedTotalQuantity} szt.`],
        [
          "Wartość zapasu wg cen sprzedaży",
          `${formatCurrency(selectedTotalValue)} zł`,
        ],
      ];

      summaryRows.forEach(([label, value], index) => {
        const rowY = boxY + 7 + index * 7;
        if (index > 0) {
          doc.setDrawColor(225, 228, 232);
          doc.setLineWidth(0.2);
          doc.line(20, rowY - 4.5, 190, rowY - 4.5);
        }

        doc.setFont("Arial", "normal");
        doc.setFontSize(8);
        doc.setTextColor(108, 117, 125);
        doc.text(sanitizeText(label), 20, rowY);

        doc.setFont("Arial", "bold");
        doc.setFontSize(index === 2 ? 9 : 8.5);
        doc.setTextColor(
          index === 2 ? 173 : 33,
          index === 2 ? 119 : 37,
          index === 2 ? 0 : 41,
        );
        doc.text(sanitizeText(value), 190, rowY, { align: "right" });
      });

      doc.setFont("Arial", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(108, 117, 125);
      doc.text(
        sanitizeText(
          "Wartość obliczono na podstawie aktualnych cen sprzedaży produktu; ceny zakupu z dokumentów PZ nie są uwzględnione.",
        ),
        20,
        boxY + 32,
      );

      doc.save(
        `Raport_Magazynowy_${new Date().toISOString().split("T")[0]}.pdf`,
      );
      onClose();
    } catch (err) {
      console.error("Blad generowania PDF:", err);
      alert("Wystapil blad podczas generowania pliku PDF.");
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-xl modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title fw-bold fs-6">
              Konfigurator i Podgląd Raportu Inwentaryzacyjnego PDF
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body p-4">
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="bg-light border rounded p-2 text-primary fw-semibold small">
                  Wybrano modeli:{" "}
                  <strong>
                    {selectedProducts.length} z {products.length}
                  </strong>
                </div>
              </div>
              <div className="col-md-6">
                <div className="bg-light border rounded p-2 text-success fw-semibold small text-end">
                  Wartość zapasu wg cen sprzedaży:{" "}
                  <strong>{formatCurrency(selectedTotalValue)} zł</strong>
                </div>
              </div>
            </div>

            <div className="row g-4">
              <div className="col-md-5 border-end pe-3">
                <h6
                  className="fw-bold text-dark mb-3 small text-uppercase"
                  style={{ letterSpacing: "0.5px" }}
                >
                  1. Wybierz pozycje do raportu
                </h6>

                <div
                  className="tree-container pe-2"
                  style={{ maxHeight: "380px", overflowY: "auto" }}
                >
                  {categories.map((cat) => {
                    const catProducts = productsByCategory[cat.id] || [];
                    const catProductIds = catProducts.map((p) => String(p.id));
                    const isCatSelected =
                      catProductIds.length > 0 &&
                      catProductIds.every((id) =>
                        selectedProductIds.includes(id),
                      );
                    const isExpanded = expandedCategories[cat.id];

                    return (
                      <div
                        key={cat.id}
                        className="mb-2 border rounded p-2 bg-light"
                      >
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="form-check mb-0">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              id={`cat-check-${cat.id}`}
                              checked={isCatSelected}
                              onChange={() => handleToggleCategory(cat.id)}
                            />
                            <label
                              className="form-check-label fw-bold text-dark ms-1 small"
                              htmlFor={`cat-check-${cat.id}`}
                            >
                              {cat.name} ({catProducts.length})
                            </label>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-link text-decoration-none py-0 px-1 text-secondary"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => toggleExpand(cat.id)}
                          >
                            {isExpanded ? "Zwiń" : "Rozwiń"}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="ms-3 mt-2 border-start ps-2">
                            {catProducts.length === 0 ? (
                              <small className="text-muted d-block py-1">
                                Brak produktów w tej kategorii
                              </small>
                            ) : (
                              catProducts.map((prod) => (
                                <div key={prod.id} className="form-check py-1">
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    id={`prod-check-${prod.id}`}
                                    checked={selectedProductIds.includes(
                                      String(prod.id),
                                    )}
                                    onChange={() =>
                                      handleToggleProduct(prod.id)
                                    }
                                  />
                                  <label
                                    className="form-check-label small text-secondary ms-1"
                                    htmlFor={`prod-check-${prod.id}`}
                                  >
                                    {prod.name}{" "}
                                    <span className="text-muted">
                                      ({prod.product_code})
                                    </span>
                                  </label>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="col-md-7">
                <h6
                  className="fw-bold text-dark mb-3 small text-uppercase"
                  style={{ letterSpacing: "0.5px" }}
                >
                  2. Podgląd wybranego asortymentu ({selectedProducts.length})
                </h6>

                <div
                  className="bg-white p-3 rounded border"
                  style={{ maxHeight: "380px", overflowY: "auto" }}
                >
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-5 text-muted small">
                      Zaznacz co najmniej jeden produkt po lewej stronie, aby
                      wygenerować raport.
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle small mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Produkt / Model</th>
                            <th className="text-center">Kod SKU</th>
                            <th className="text-center">Ilość</th>
                            <th className="text-end">Cena sprzedaży (zł)</th>
                            <th className="text-end">Wartość</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedProducts.map((p) => {
                            const sellPrice = Number(
                              p.selling_price ?? p.price ?? 0,
                            );
                            const quantity =
                              inventorySummaries[p.id]?.quantity || 0;
                            return (
                              <tr key={p.id}>
                                <td className="fw-semibold text-dark">
                                  {p.name}
                                </td>
                                <td className="text-center text-secondary">
                                  {p.product_code || "—"}
                                </td>
                                <td className="text-center">
                                  <span className="badge bg-light text-dark border">
                                    {quantity} szt.
                                  </span>
                                </td>
                                <td className="text-end text-secondary">
                                  {formatCurrency(sellPrice)} zł
                                </td>
                                <td className="text-end fw-bold text-dark">
                                  {formatCurrency(sellPrice * quantity)} zł
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
            <button
              type="button"
              className="btn btn-primary fw-bold px-4"
              disabled={selectedProducts.length === 0}
              onClick={generatePDF}
            >
              Pobierz PDF ({selectedProducts.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPdfModal;
