import React, { useEffect, useMemo, useState } from "react";
import API from "../api/axios";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const normalizeText = (value) => (value || "").trim().toLowerCase();

const normalizePolishText = (value) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const generateUniqueUsername = (
  firstName,
  lastName,
  existingUsers = [],
  currentUserId = null,
) => {
  if (!firstName || !lastName) return "";

  const cleanFn = normalizePolishText(firstName);
  const cleanLn = normalizePolishText(lastName);
  const base = `${cleanFn.charAt(0)}.${cleanLn}`;

  const filteredUsers = existingUsers.filter(
    (u) => !currentUserId || String(u.id) !== String(currentUserId),
  );

  const baseTaken = filteredUsers.some(
    (u) => u.username.toLowerCase() === base.toLowerCase(),
  );

  if (!baseTaken) {
    return base;
  }

  let maxNum = 1;
  filteredUsers.forEach((u) => {
    const uname = u.username.toLowerCase();
    if (uname.startsWith(base)) {
      const suffix = uname.replace(base, "");
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  return `${base}${maxNum + 1}`;
};

const Admin = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [editingUser, setEditingUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);

  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    roleId: "",
    newPassword: "",
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    password: "",
    roleId: "",
  });

  const [message, setMessage] = useState({ type: "", text: "" });
  // Lokalny stan błędu dedykowany do okna modalnego edycji
  const [editMessage, setEditMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    fetchUsersAndRoles();
  }, []);

  const fetchUsersAndRoles = async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        API.get("/users"),
        API.get("/users/roles"),
      ]);
      setUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (err) {
      console.error("Błąd pobierania danych użytkowników:", err);
    }
  };

  const refreshUsersAndRoles = async () => {
    await fetchUsersAndRoles();
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    if (formData.password.length < 6) {
      setMessage({
        type: "danger",
        text: "Hasło musi mieć co najmniej 6 znaków.",
      });
      return;
    }

    const generatedUsername = generateUniqueUsername(
      formData.firstName,
      formData.lastName,
      users,
    );

    try {
      await API.post("/users", { ...formData, username: generatedUsername });
      setMessage({
        type: "success",
        text: `Zarejestrowano użytkownika jako: ${generatedUsername}`,
      });
      setFormData({ firstName: "", lastName: "", password: "", roleId: "" });
      setShowAddForm(false);
      await refreshUsersAndRoles();
    } catch (err) {
      setMessage({
        type: "danger",
        text: err.response?.data?.message || "Błąd podczas rejestracji.",
      });
    }
  };

  const handleStartEdit = (u) => {
    setEditingUser(u);
    setEditFormData({
      firstName: u.first_name || u.firstName || "",
      lastName: u.last_name || u.lastName || "",
      roleId: u.role_id || u.roleId || "",
      newPassword: "",
    });
    setEditMessage({ type: "", text: "" }); // Wyczyszczenie błędu
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditMessage({ type: "", text: "" });

    if (!editingUser) {
      return;
    }

    if (editFormData.newPassword && editFormData.newPassword.trim() !== "") {
      if (editFormData.newPassword.length < 6) {
        setEditMessage({
          type: "danger",
          text: "Nowe hasło musi mieć co najmniej 6 znaków.",
        });
        return; // Zostaje w modalu na wierzchu!
      }
    }

    if (
      editFormData.firstName === editingUser.first_name &&
      editFormData.lastName === editingUser.last_name &&
      String(editFormData.roleId) === String(editingUser.role_id) &&
      !editFormData.newPassword
    ) {
      setEditingUser(null);
      return;
    }

    try {
      const payload = {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        roleId: editFormData.roleId,
      };
      if (editFormData.newPassword && editFormData.newPassword.trim() !== "") {
        payload.password = editFormData.newPassword;
      }

      await API.put(`/users/${editingUser.id}`, payload);
      setMessage({
        type: "success",
        text: `Zaktualizowano dane użytkownika: ${editingUser.username}`,
      });
      setEditingUser(null);
      await refreshUsersAndRoles();
    } catch (err) {
      // Wyświetlamy błąd bezpośrednio wewnątrz modalu na wierzchu
      setEditMessage({
        type: "danger",
        text: err.response?.data?.message || "Nie udało się zapisać zmian.",
      });
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await API.delete(`/users/${userToDelete.id}`);
      setMessage({
        type: "success",
        text: `Zarchiwizowano konto użytkownika ${userToDelete.username}`,
      });
      setUserToDelete(null);
      await refreshUsersAndRoles();
    } catch (err) {
      setMessage({
        type: "danger",
        text: err.response?.data?.message || "Błąd podczas usuwania.",
      });
      setUserToDelete(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = normalizeText(searchTerm);

    return users.filter((user) => {
      const fullName = normalizeText(`${user.first_name} ${user.last_name}`);
      const username = normalizeText(user.username);
      return fullName.includes(query) || username.includes(query);
    });
  }, [searchTerm, users]);

  return (
    <div className="container py-4">
      {message.text && (
        <div
          className={`alert alert-${message.type} alert-dismissible fade show mb-4`}
        >
          {message.text}
        </div>
      )}

      {!showAddForm ? (
        <div className="card p-4 shadow-sm border-0">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h4 className="fw-bold mb-0">Użytkownicy systemu</h4>
            <div className="input-group" style={{ maxWidth: "280px" }}>
              <input
                type="text"
                className="form-control"
                placeholder="Znajdź użytkownika..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="btn btn-outline-secondary" type="button">
                <i className="bi bi-search"></i>
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th>Imię i nazwisko</th>
                  <th>Login</th>
                  <th>Rola systemowa</th>
                  <th>Data utworzenia</th>
                  <th className="text-end">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf =
                    String(u.id) === String(user?.id) ||
                    u.username === user?.username;

                  return (
                    <tr key={u.id}>
                      <td className="fw-semibold">
                        {u.first_name} {u.last_name}
                      </td>
                      <td className="text-secondary">{u.username}</td>
                      <td>
                        <span
                          className={`badge ${u.role_name === "Administrator" ? "bg-danger" : u.role_name === "Kierownik" ? "bg-warning text-dark" : "bg-info text-dark"}`}
                        >
                          {u.role_name}
                        </span>
                      </td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="text-end">
                        <button
                          className="btn btn-sm btn-outline-secondary me-2"
                          onClick={() => handleStartEdit(u)}
                          title="Edytuj profil"
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          disabled={isSelf}
                          onClick={() => setUserToDelete(u)}
                          title={
                            isSelf
                              ? "Nie możesz usunąć własnego konta"
                              : "Usuń użytkownika"
                          }
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="fw-semibold text-muted">
              Liczba użytkowników: {filteredUsers.length}
            </span>
            <button
              className="btn btn-primary px-4 fw-semibold"
              onClick={() => setShowAddForm(true)}
            >
              Dodaj użytkownika
            </button>
          </div>
        </div>
      ) : (
        /* Formularz Rejestracji */
        <div
          className="card p-4 shadow-sm mx-auto border-0"
          style={{ maxWidth: "480px" }}
        >
          <h4 className="fw-bold mb-4 text-center">
            Rejestracja nowego użytkownika
          </h4>
          <form onSubmit={handleCreateUser}>
            <div className="mb-3">
              <label className="form-label small fw-bold">Imię</label>
              <input
                type="text"
                name="firstName"
                className="form-control"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label small fw-bold">Nazwisko</label>
              <input
                type="text"
                name="lastName"
                className="form-control"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                required
              />
            </div>

            {formData.firstName && formData.lastName && (
              <div className="alert alert-info py-2 small mb-3">
                Wygenerowany login:{" "}
                <strong>
                  {generateUniqueUsername(
                    formData.firstName,
                    formData.lastName,
                    users,
                  )}
                </strong>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-bold">Rola</label>
              <select
                name="roleId"
                className="form-select"
                value={formData.roleId}
                onChange={(e) =>
                  setFormData({ ...formData, roleId: e.target.value })
                }
                required
              >
                <option value="">Wybierz rolę systemową</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="form-label small fw-bold">Hasło</label>
              <input
                type="password"
                name="password"
                className="form-control"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 fw-bold py-2 mb-2"
            >
              Zarejestruj
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary w-100 btn-sm"
              onClick={() => setShowAddForm(false)}
            >
              Anuluj i wróć
            </button>
          </form>
        </div>
      )}

      {editingUser && (
        <div
          className="modal show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  Edycja profilu: {editingUser.username}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setEditingUser(null)}
                ></button>
              </div>
              <form onSubmit={handleSaveEdit}>
                <div className="modal-body p-4">
                  {/* Błąd edycji wyświetlany bezpośrednio na wierzchu wewnątrz modalu */}
                  {editMessage.text && (
                    <div
                      className={`alert alert-${editMessage.type} py-2 small mb-3 fw-semibold`}
                    >
                      <i className="bi bi-exclamation-triangle-fill me-2"></i>
                      {editMessage.text}
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label small fw-bold">Imię</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFormData.firstName}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          firstName: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Nazwisko</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFormData.lastName}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          lastName: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  {(editFormData.firstName !== editingUser.first_name ||
                    editFormData.lastName !== editingUser.last_name) && (
                    <div className="alert alert-warning py-1 small mb-3">
                      Nowy login po zmianie:{" "}
                      <strong>
                        {generateUniqueUsername(
                          editFormData.firstName,
                          editFormData.lastName,
                          users,
                          editingUser.id,
                        )}
                      </strong>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="form-label small fw-bold">
                      Rola systemowa (RBAC)
                    </label>
                    <select
                      className="form-select"
                      value={editFormData.roleId}
                      disabled={
                        String(editingUser.id) === String(user?.id) ||
                        editingUser.username === user?.username
                      }
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          roleId: e.target.value,
                        })
                      }
                      required
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {(String(editingUser.id) === String(user?.id) ||
                      editingUser.username === user?.username) && (
                      <small className="text-muted">
                        Własna rola administratora nie może być zmieniana.
                      </small>
                    )}
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">
                      Nowe Hasło (opcjonalnie)
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Wpisz, jeśli chcesz zmienić hasło"
                      value={editFormData.newPassword}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          newPassword: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditingUser(null)}
                  >
                    Anuluj
                  </button>
                  <button type="submit" className="btn btn-primary fw-bold">
                    Zapisz zmiany
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {userToDelete && (
        <ConfirmDeleteModal
          title="Usunięcie Użytkownika"
          itemText={`${userToDelete.first_name} ${userToDelete.last_name} (${userToDelete.username})`}
          onConfirm={handleConfirmDeleteUser}
          onCancel={() => setUserToDelete(null)}
        />
      )}
    </div>
  );
};

export default Admin;
