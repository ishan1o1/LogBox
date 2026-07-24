import { useState, useEffect, useContext, useCallback } from "react";
import { AuthContext } from "../context/AuthContext";
import { authFetch, API_ORIGIN } from "../services/apiClient";
import Navbar from "../components/Navbar";
import "../styles/AdminPanel.css";

/* ─── helpers ─────────────────────────────────────────── */
const ROLE_OPTIONS = ["VIEWER", "DEVELOPER", "ADMIN"];

const ROLE_BADGE_CLASS = {
  ADMIN: "role-badge role-admin",
  DEVELOPER: "role-badge role-developer",
  VIEWER: "role-badge role-viewer",
};

function RoleBadge({ role }) {
  return (
    <span className={ROLE_BADGE_CLASS[role?.toUpperCase()] || "role-badge"}>
      {role}
    </span>
  );
}

/* ─── Users tab ───────────────────────────────────────── */
function UsersTab() {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null); // userId being actioned

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
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    setActionLoading(userId + "-delete");
    try {
      const res = await authFetch(`${API_ORIGIN}/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="panel-loading">
        <div className="panel-spinner" />
        <span>Loading users…</span>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <div>
          <h2>User Management</h2>
          <p className="panel-section-subtitle">
            Manage team members and their access roles.
          </p>
        </div>
        <button className="panel-btn panel-btn-ghost" onClick={loadUsers}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {error && <div className="panel-error" role="alert">{error}</div>}

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
                      <div className="user-avatar">{(u.name || "?")[0].toUpperCase()}</div>
                      <span>{u.name}</span>
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
                      {/* Role change — not for self */}
                      {!isSelf && (
                        <select
                          className="role-select"
                          value={u.role}
                          disabled={actionLoading === u.id + "-role"}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          aria-label={`Change role for ${u.name}`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}

                      {/* Delete — not for self */}
                      {!isSelf && (
                        <button
                          className="panel-btn panel-btn-danger panel-btn-sm"
                          disabled={actionLoading === u.id + "-delete"}
                          onClick={() => handleDelete(u.id, u.name)}
                          aria-label={`Delete ${u.name}`}
                        >
                          {actionLoading === u.id + "-delete" ? "…" : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4h6v2"/>
                            </svg>
                          )}
                        </button>
                      )}

                      {isSelf && (
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
          <div className="panel-empty">No users found.</div>
        )}
      </div>
    </div>
  );
}

/* ─── API Keys tab ────────────────────────────────────── */
function ApiKeysTab() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null); // the raw key shown once

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

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!serviceName.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName: serviceName.trim(), permissions: ["logs:write"] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create API key");

      // Show the raw key once — it will never be shown again
      setNewKey({ key: data.apiKey, serviceName: data.serviceName });
      setServiceName("");
      setShowCreate(false);
      loadKeys(); // refresh list
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId, keyService) => {
    if (!window.confirm(`Revoke API key for "${keyService}"? Services using it will immediately lose access.`)) return;
    setActionLoading(keyId);
    try {
      const res = await authFetch(`${API_ORIGIN}/apikeys/${keyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke key");
      }
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="panel-loading">
        <div className="panel-spinner" />
        <span>Loading API keys…</span>
      </div>
    );
  }

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <div>
          <h2>API Key Management</h2>
          <p className="panel-section-subtitle">
            Manage service credentials. Keys are stored as SHA-256 hashes — the raw
            key is shown <strong>only once</strong> at creation time.
          </p>
        </div>
        <button
          className="panel-btn panel-btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Cancel" : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New API Key
            </>
          )}
        </button>
      </div>

      {error && <div className="panel-error" role="alert">{error}</div>}

      {/* ── New-key revealed banner ─── */}
      {newKey && (
        <div className="new-key-banner" role="alert">
          <div className="new-key-banner-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
            </svg>
            <strong>API Key Created — Save It Now!</strong>
            <button className="new-key-dismiss" onClick={() => setNewKey(null)} aria-label="Dismiss">✕</button>
          </div>
          <p>This key will <strong>not</strong> be shown again. Copy it and store it securely.</p>
          <div className="new-key-code-wrap">
            <code className="new-key-code">{newKey.key}</code>
            <button
              className="panel-btn panel-btn-ghost panel-btn-sm"
              onClick={() => navigator.clipboard.writeText(newKey.key)}
            >
              Copy
            </button>
          </div>
          <p className="new-key-hint">Service: <strong>{newKey.serviceName}</strong></p>
          <p className="new-key-hint">Use as: <code>X-API-Key: {newKey.key}</code></p>
        </div>
      )}

      {/* ── Create form ─── */}
      {showCreate && (
        <form className="create-key-form" onSubmit={handleCreate}>
          <div className="create-key-fields">
            <label className="create-key-label" htmlFor="service-name-input">
              Service name
            </label>
            <input
              id="service-name-input"
              className="create-key-input"
              type="text"
              placeholder="e.g. auth-service, payment-api"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <p className="create-key-note">
            This key will have the <code>logs:write</code> permission, allowing it to
            send logs via <code>POST /log</code>.
          </p>
          <button
            className="panel-btn panel-btn-primary"
            type="submit"
            disabled={creating}
          >
            {creating ? "Creating…" : "Generate Key"}
          </button>
        </form>
      )}

      {/* ── Keys table ─── */}
      <div className="panel-table-wrap">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Service name</th>
              <th>Owner</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>
                  <div className="service-cell">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                    </svg>
                    <span>{k.serviceName}</span>
                  </div>
                </td>
                <td className="email-cell">
                  {k.owner?.name || k.owner?.email || "—"}
                </td>
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
                <td>
                  {k.active ? (
                    <button
                      className="panel-btn panel-btn-danger panel-btn-sm"
                      disabled={actionLoading === k.id}
                      onClick={() => handleRevoke(k.id, k.serviceName)}
                      aria-label={`Revoke key for ${k.serviceName}`}
                    >
                      {actionLoading === k.id ? "…" : "Revoke"}
                    </button>
                  ) : (
                    <span className="revoked-note">Revoked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {keys.length === 0 && !loading && (
          <div className="panel-empty">
            No API keys yet. Create one to allow services to send logs.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main AdminPanel page ────────────────────────────── */
function AdminPanel() {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="admin-panel">
      <Navbar user={user} logout={logout} title="Admin Panel" />

      <div className="admin-panel-body">
        {/* Sidebar nav */}
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
            <a href="/dashboard" className="admin-nav-back-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back to Dashboard
            </a>
          </div>
        </aside>

        {/* Main content */}
        <main className="admin-panel-main">
          {activeTab === "users" && <UsersTab />}
          {activeTab === "apikeys" && <ApiKeysTab />}
        </main>
      </div>
    </div>
  );
}

export default AdminPanel;
