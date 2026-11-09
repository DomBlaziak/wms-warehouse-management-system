import React from "react";

const ConfirmDeleteModal = ({
  title,
  itemText,
  onConfirm,
  onCancel,
  message = "Czy na pewno chcesz usunąć następujący rekord?",
  warning = "Ta operacja jest nieodwracalna.",
}) => {
  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-danger text-white">
            <h5 className="modal-title fw-bold">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {title || "Potwierdzenie usunięcia"}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onCancel}
            ></button>
          </div>
          <div className="modal-body p-4 text-center">
            <p className="mb-2">
              {message}
            </p>
            <h5 className="fw-bold text-dark mb-3">{itemText}</h5>
            <p className="small text-muted mb-0">{warning}</p>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Anuluj
            </button>
            <button
              type="button"
              className="btn btn-danger fw-bold px-4"
              onClick={onConfirm}
            >
              Usuń
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
