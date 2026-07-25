import { useState, useEffect, useContext, useCallback } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { authFetch, API_ORIGIN } from "../services/apiClient";
import Navbar from "../components/Navbar";
import "../styles/AdminPanel.css";

/* ─── Helpers & Constants ────────────────────────────── */
const ROLE_OPTIONS = ["ADMIN", "DEVELOPER", "VIEWER", "SERVICE"];

const ROLE_BADGE_CLASS = {
  ADMIN: "role-badge role-admin",
  DEVELOPER: "role-badge role-developer",
  VIEWER: "role-badge role-viewer",
  SERVICE: "role-badge role-viewer",
};

function RoleBadge({ role }) {
  return (
    <span className={ROLE_BADGE_CLASS[role?.toUpperCase()] || "role-badge"}>
      {role}
    </span>
  );
}

/* ─── Toast Component ────────────────────────────────── */
function ToastContainer({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className="panel-toast-container">
      <div className={`panel-toast panel-toast-${toast.type}`}>
        <span>{toast.type === "success" ? "✓" : "✕"}</span>
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

/* ─── Add User Modal ─────────────────────────────────── */
function AddUserModal({ isOpen, onClose, onUserAdded, showToast }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await authFetch(`${API_ORIGIN}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add user");
      }

      showToast("success", data.message || "User added to organization successfully");
      setName("");
      setEmail("");
      setRole("VIEWER");
      onUserAdded();
      onClose();
    } catch (err) {
      setError(err.message);
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Add Organization Member</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="panel-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="user-name">Full Name</label>
              <input
                id="user-name"
                className="form-control"
                type="text"
                placeholder="e.g. Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="user-email">Email Address *</label>
              <input
                id="user-email"
                className="form-control"
                type="email"
                placeholder="e.g. jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="user-role">Role *</label>
              <select
                id="user-role"
                className="form-control"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="panel-btn panel-btn-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="panel-btn panel-btn-primary"
              disabled={loading}
            >
              {loading ? "Adding User…" : "Add User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Confirm Modal Component ─────────────────────────── */
function ConfirmModal({ isOpen, title, message, confirmText = "Confirm", confirmVariant = "danger", loading, onConfirm, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "420px" }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close-btn" onClick={onClose} disabled={loading}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--text-secondary)" }}>
            {message}
          </p>
        </div>
        <div className="modal-footer">
          <button className="panel-btn panel-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={`panel-btn panel-btn-${confirmVariant}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Users Tab Component ─────────────────────────────── */
function UsersTab({ showToast }) {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Confirm delete modal state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API_ORIGIN}/users`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId + "-role");
    try {
      const res = await authFetch(`${API_ORIGIN}/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: data.user.role } : u))
      );
      showToast("success", `Role updated to ${newRole}`);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmUser) return;
    const { id: userId, name: userName } = deleteConfirmUser;
    setActionLoading(userId + "-delete");
    try {
      const res = await authFetch(`${API_ORIGIN}/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast("success", `User "${userName}" removed`);
      setDeleteConfirmUser(null);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <div>
          <h2>User Management</h2>
          <p className="panel-section-subtitle">
            Manage organization members and their access permissions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="panel-btn panel-btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add User
          </button>
          <button className="panel-btn panel-btn-ghost" onClick={loadUsers} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="panel-error" role="alert">{error}</div>}

      {loading ? (
        <div className="panel-loading">
          <div className="panel-spinner" />
          <span>Loading users…</span>
        </div>
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={isSelf ? "row-self" : ""}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar">{(u.name || u.email || "?")[0].toUpperCase()}</div>
                        <span>{u.name || "—"}</span>
                        {isSelf && <span className="you-badge">you</span>}
                      </div>
                    </td>
                    <td className="email-cell">{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="date-cell">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="actions-cell">
                        {!isSelf ? (
                          <>
                            <select
                              className="role-select"
                              value={u.role}
                              disabled={actionLoading === u.id + "-role"}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              aria-label={`Change role for ${u.name || u.email}`}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>

                            <button
                              className="panel-btn panel-btn-danger panel-btn-sm"
                              disabled={actionLoading === u.id + "-delete"}
                              onClick={() => setDeleteConfirmUser({ id: u.id, name: u.name || u.email })}
                              aria-label={`Delete ${u.name || u.email}`}
                            >
                              {actionLoading === u.id + "-delete" ? "…" : "Remove"}
                            </button>
                          </>
                        ) : (
                          <span className="self-note">Cannot modify own account</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {users.length === 0 && !loading && (
            <div className="panel-empty">No users found in this organization.</div>
          )}
        </div>
      )}

      <AddUserModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onUserAdded={loadUsers}
        showToast={showToast}
      />

      <ConfirmModal
        isOpen={Boolean(deleteConfirmUser)}
        title="Remove User"
        message={`Are you sure you want to remove "${deleteConfirmUser?.name}" from this organization?`}
        confirmText="Remove User"
        confirmVariant="danger"
        loading={Boolean(actionLoading)}
        onConfirm={executeDelete}
        onClose={() => setDeleteConfirmUser(null)}
      />
    </div>
  );
}

/* ─── Raw API Key Modal (Shown ONCE at Creation) ─────── */
function RawApiKeyModal({ keyData, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!keyData) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(keyData.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "520px" }}>
        <div className="modal-header">
          <h3>API Key Created</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--text-secondary)" }}>
            Copy this key now. <strong>It will never be shown again.</strong>
          </p>
          <div className="new-key-code-wrap" style={{ marginTop: "10px" }}>
            <code className="new-key-code">{keyData.key}</code>
            <button className="panel-btn panel-btn-ghost panel-btn-sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="new-key-hint" style={{ marginTop: "8px" }}>
            Service Name: <strong>{keyData.serviceName}</strong>
          </p>
        </div>
        <div className="modal-footer">
          <button className="panel-btn panel-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create API Key Modal ────────────────────────────── */
function CreateApiKeyModal({ isOpen, onClose, onKeyCreated, showToast }) {
  const [serviceName, setServiceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!serviceName.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: serviceName.trim(),
          permissions: ["logs:write"],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate API key");
      }

      setServiceName("");
      onKeyCreated({ key: data.apiKey, serviceName: data.serviceName || serviceName });
      onClose();
    } catch (err) {
      setError(err.message);
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Generate New API Key</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="panel-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="service-name">Service Name *</label>
              <input
                id="service-name"
                className="form-control"
                type="text"
                placeholder="e.g. payment-service, auth-api"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <p className="create-key-note">
              API keys are generated with <code>logs:write</code> permissions for ingestion.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="panel-btn panel-btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="panel-btn panel-btn-primary" disabled={loading}>
              {loading ? "Generating…" : "Generate Key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── API Keys Tab Component ───────────────────────────── */
function ApiKeysTab({ showToast }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rawKeyData, setRawKeyData] = useState(null);

  // Confirm modal states
  const [revokeConfirmKey, setRevokeConfirmKey] = useState(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load API keys");
      setKeys(data.apiKeys || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    showToast("success", "API Key ID copied to clipboard");
  };

  const executeRevoke = async () => {
    if (!revokeConfirmKey) return;
    const { id: keyId, serviceName } = revokeConfirmKey;
    setActionLoading(keyId);
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys/${keyId}/revoke`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke API key");

      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, active: false, revoked: true } : k)));
      showToast("success", `API key for "${serviceName}" revoked`);
      setRevokeConfirmKey(null);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (keyId, serviceName) => {
    setActionLoading(keyId);
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys/${keyId}/reactivate`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reactivate API key");

      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, active: true, revoked: false } : k)));
      showToast("success", `API key for "${serviceName}" reactivated`);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmKey) return;
    const { id: keyId, serviceName } = deleteConfirmKey;
    setActionLoading(keyId);
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete API key");
      }

      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      showToast("success", `API key for "${serviceName}" deleted`);
      setDeleteConfirmKey(null);
    } catch (err) {
      showToast("error", err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <div>
          <h2>API Key Management</h2>
          <p className="panel-section-subtitle">
            Manage service credentials. Keys are stored as SHA-256 hashes — the raw key is shown <strong>only once</strong>.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="panel-btn panel-btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Generate Key
          </button>
          <button className="panel-btn panel-btn-ghost" onClick={loadKeys} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="panel-error" role="alert">{error}</div>}

      {loading ? (
        <div className="panel-loading">
          <div className="panel-spinner" />
          <span>Loading API keys…</span>
        </div>
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Owner</th>
                <th>Permissions</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const ownerName = typeof k.owner === "object" && k.owner !== null
                  ? (k.owner.name || k.owner.email)
                  : (k.owner || "—");

                return (
                  <tr key={k.id}>
                    <td>
                      <div className="service-cell">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                        </svg>
                        <span>{k.serviceName}</span>
                      </div>
                    </td>
                    <td className="email-cell">{ownerName}</td>
                    <td>
                      {(k.permissions || []).map((p) => (
                        <span key={p} className="perm-badge">{p}</span>
                      ))}
                    </td>
                    <td>
                      <span className={`status-badge ${k.active ? "status-active" : "status-revoked"}`}>
                        {k.active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="date-cell">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="date-cell">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button
                          className="panel-btn panel-btn-ghost panel-btn-sm"
                          onClick={() => handleCopyId(k.id)}
                          title="Copy Key ID"
                        >
                          Copy ID
                        </button>

                        {k.active ? (
                          <button
                            className="panel-btn panel-btn-danger panel-btn-sm"
                            disabled={actionLoading === k.id}
                            onClick={() => setRevokeConfirmKey({ id: k.id, serviceName: k.serviceName })}
                          >
                            {actionLoading === k.id ? "…" : "Revoke"}
                          </button>
                        ) : (
                          <button
                            className="panel-btn panel-btn-ghost panel-btn-sm"
                            disabled={actionLoading === k.id}
                            onClick={() => handleReactivate(k.id, k.serviceName)}
                          >
                            {actionLoading === k.id ? "…" : "Reactivate"}
                          </button>
                        )}

                        <button
                          className="panel-btn panel-btn-danger panel-btn-sm"
                          disabled={actionLoading === k.id}
                          onClick={() => setDeleteConfirmKey({ id: k.id, serviceName: k.serviceName })}
                          title="Delete API key"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {keys.length === 0 && !loading && (
            <div className="panel-empty">
              No API keys found. Click "Generate Key" to create service credentials.
            </div>
          )}
        </div>
      )}

      <CreateApiKeyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onKeyCreated={(keyData) => {
          setRawKeyData(keyData);
          loadKeys();
        }}
        showToast={showToast}
      />

      <RawApiKeyModal
        keyData={rawKeyData}
        onClose={() => setRawKeyData(null)}
      />

      <ConfirmModal
        isOpen={Boolean(revokeConfirmKey)}
        title="Revoke API Key"
        message={`Are you sure you want to revoke the API key for "${revokeConfirmKey?.serviceName}"? Services using this key will immediately lose access.`}
        confirmText="Revoke Key"
        confirmVariant="danger"
        loading={Boolean(actionLoading)}
        onConfirm={executeRevoke}
        onClose={() => setRevokeConfirmKey(null)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteConfirmKey)}
        title="Delete API Key"
        message={`Are you sure you want to permanently delete the API key for "${deleteConfirmKey?.serviceName}"? This action cannot be undone.`}
        confirmText="Delete Key"
        confirmVariant="danger"
        loading={Boolean(actionLoading)}
        onConfirm={executeDelete}
        onClose={() => setDeleteConfirmKey(null)}
      />
    </div>
  );
}

/* ─── Main AdminPanel Page ────────────────────────────── */
function AdminPanel() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("users");
  const [toast, setToast] = useState(null);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  return (
    <div className="admin-panel">
      <Navbar user={user} logout={logout} title="Admin Panel" />

      <div className="admin-panel-body">
        {/* Sidebar Nav */}
        <aside className="admin-panel-nav">
          <div className="admin-nav-brand">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Administration</span>
          </div>

          <nav className="admin-nav-list">
            <button
              className={`admin-nav-item ${activeTab === "users" ? "active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Users
            </button>

            <button
              className={`admin-nav-item ${activeTab === "apikeys" ? "active" : ""}`}
              onClick={() => setActiveTab("apikeys")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              API Keys
            </button>
          </nav>

          <div className="admin-nav-back">
            <Link to="/dashboard" className="admin-nav-back-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="admin-panel-main">
          {activeTab === "users" && <UsersTab showToast={showToast} />}
          {activeTab === "apikeys" && <ApiKeysTab showToast={showToast} />}
        </main>
      </div>

      <ToastContainer toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

export default AdminPanel;
