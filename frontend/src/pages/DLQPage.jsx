import { useState, useEffect, useCallback, useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import {
  listDLQ,
  replayOne,
  replayAll,
  deleteDLQEntry,
  getMetrics,
} from "../services/dlqApi";
import "../styles/DLQPage.css";

// ─── Attempt badge ────────────────────────────────────────────────────────────

const ATTEMPT_BADGE = {
  1: { label: "Attempt 1", cls: "badge-attempt-1" },
  2: { label: "Attempt 2", cls: "badge-attempt-2" },
  3: { label: "Attempt 3", cls: "badge-attempt-3" },
  4: { label: "Attempt 4", cls: "badge-attempt-4" },
};

function AttemptBadge({ attempt }) {
  const n = Number(attempt) || 0;
  if (n >= 5) {
    return <span className="dlq-badge badge-dlq">DLQ</span>;
  }
  const def = ATTEMPT_BADGE[n] || { label: `Attempt ${n}`, cls: "badge-attempt-4" };
  return <span className={`dlq-badge ${def.cls}`}>{def.label}</span>;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }) {
  return (
    <div className={`dlq-stat-card ${accent ? `dlq-stat-card--${accent}` : ""}`}>
      <div className="dlq-stat-icon">{icon}</div>
      <div className="dlq-stat-body">
        <span className="dlq-stat-value">{value ?? "—"}</span>
        <span className="dlq-stat-label">{label}</span>
      </div>
    </div>
  );
}

// ─── Expanded log view ────────────────────────────────────────────────────────

function LogExpander({ entry }) {
  return (
    <tr className="dlq-expand-row">
      <td colSpan={7} className="dlq-expand-cell">
        <div className="dlq-expand-grid">
          <div className="dlq-expand-section">
            <h4>Failure Details</h4>
            <dl className="dlq-detail-list">
              <dt>Error</dt>
              <dd className="dlq-error-text">{entry.lastError || "—"}</dd>
              <dt>First failure</dt>
              <dd>{entry.firstFailureAt ? new Date(entry.firstFailureAt).toLocaleString() : "—"}</dd>
              <dt>Last failure</dt>
              <dd>{entry.lastFailureAt ? new Date(entry.lastFailureAt).toLocaleString() : "—"}</dd>
              <dt>traceId</dt>
              <dd className="dlq-mono">{entry.traceId || "—"}</dd>
              <dt>requestId</dt>
              <dd className="dlq-mono">{entry.requestId || "—"}</dd>
              <dt>documentId</dt>
              <dd className="dlq-mono">{entry.documentId || "—"}</dd>
            </dl>
          </div>
          <div className="dlq-expand-section">
            <h4>Raw Log Payload</h4>
            <pre className="dlq-raw-json">
              {JSON.stringify(entry.rawLog || {}, null, 2)}
            </pre>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function DLQRow({ entry, isAdmin, onReplay, onDelete, replayingId, deletingId }) {
  const [expanded, setExpanded] = useState(false);
  const isReplaying = replayingId === entry.id;
  const isDeleting = deletingId === entry.id;

  return (
    <>
      <tr className={expanded ? "dlq-row dlq-row--expanded" : "dlq-row"}>
        {/* Attempt badge */}
        <td>
          <AttemptBadge attempt={entry.attempt} />
        </td>

        {/* Service */}
        <td>
          <span className="dlq-service-tag">{entry.service || "unknown"}</span>
        </td>

        {/* Endpoint */}
        <td>
          <span className="dlq-endpoint" title={entry.endpoint}>
            {entry.endpoint || "—"}
          </span>
        </td>

        {/* Message preview */}
        <td>
          <span
            className="dlq-message-preview"
            title={entry.message}
          >
            {entry.message ? entry.message.slice(0, 80) : <em className="dlq-na">no message</em>}
          </span>
        </td>

        {/* Error reason */}
        <td>
          <span className="dlq-error-preview" title={entry.lastError}>
            {entry.lastError ? entry.lastError.slice(0, 60) : "—"}
          </span>
        </td>

        {/* Timestamp */}
        <td className="dlq-ts">
          {entry.failedAt
            ? new Date(entry.failedAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </td>

        {/* Actions */}
        <td>
          <div className="dlq-actions">
            {/* View / collapse */}
            <button
              className={`dlq-btn dlq-btn-ghost dlq-btn-sm ${expanded ? "dlq-btn-active" : ""}`}
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse" : "View log"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {expanded
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>
                }
              </svg>
              {expanded ? "Close" : "View"}
            </button>

            {/* Replay — ADMIN only */}
            {isAdmin && (
              <button
                className="dlq-btn dlq-btn-primary dlq-btn-sm"
                disabled={isReplaying || isDeleting}
                onClick={() => onReplay(entry)}
                aria-label={`Replay ${entry.id}`}
              >
                {isReplaying
                  ? <><span className="dlq-spinner-xs" />Replaying…</>
                  : <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      Replay
                    </>
                }
              </button>
            )}

            {/* Delete — ADMIN only */}
            {isAdmin && (
              <button
                className="dlq-btn dlq-btn-danger dlq-btn-sm"
                disabled={isReplaying || isDeleting}
                onClick={() => onDelete(entry)}
                aria-label={`Delete ${entry.id}`}
              >
                {isDeleting
                  ? <><span className="dlq-spinner-xs" /></>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                }
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded details row */}
      {expanded && <LogExpander entry={entry} />}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DLQPage() {
  const { user, logout } = useContext(AuthContext);
  const isAdmin = (user?.role || "").toUpperCase() === "ADMIN";

  // ── State ──────────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState("");

  const [replayingId, setReplayingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [bulkReplaying, setBulkReplaying] = useState(false);
  const [toast, setToast] = useState(null); // { type: "success"|"error", msg }

  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshRef = useRef(null);

  // ── Toast helper ───────────────────────────────────────────────────────────
  function showToast(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadEntries = useCallback(async (cursor = "-", append = false) => {
    setLoading(true);
    setError("");
    try {
      const result = await listDLQ({ cursor, count: 50 });
      setEntries((prev) => append ? [...prev, ...(result.entries || [])] : (result.entries || []));
      setTotal(result.total || 0);
      setNextCursor(result.nextCursor || null);
    } catch (err) {
      setError(err.message || "Failed to load DLQ entries");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const snap = await getMetrics();
      setMetrics(snap);
    } catch {
      // non-fatal
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    loadEntries("-", false);
    loadMetrics();
  }, [loadEntries, loadMetrics]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Auto-refresh ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoRefresh) {
      refreshRef.current = setInterval(refresh, 10_000);
    } else {
      clearInterval(refreshRef.current);
    }
    return () => clearInterval(refreshRef.current);
  }, [autoRefresh, refresh]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleReplay = useCallback(async (entry) => {
    setReplayingId(entry.id);
    try {
      await replayOne(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast("success", `Replayed log from ${entry.service}`);
      loadMetrics();
    } catch (err) {
      showToast("error", err.message || "Replay failed");
    } finally {
      setReplayingId(null);
    }
  }, [loadMetrics]);

  const handleDelete = useCallback(async (entry) => {
    if (!window.confirm(`Permanently delete this DLQ entry from "${entry.service}"? It will not be retried.`)) return;
    setDeletingId(entry.id);
    try {
      await deleteDLQEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast("success", "Entry deleted");
      loadMetrics();
    } catch (err) {
      showToast("error", err.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, [loadMetrics]);

  const handleReplayAll = useCallback(async () => {
    if (!window.confirm(`Replay all ${total} DLQ entries? They will all be re-queued for ingestion.`)) return;
    setBulkReplaying(true);
    try {
      const result = await replayAll();
      showToast("success", result.message || "All entries replayed");
      setEntries([]);
      setTotal(0);
      setNextCursor(null);
      loadMetrics();
    } catch (err) {
      showToast("error", err.message || "Bulk replay failed");
    } finally {
      setBulkReplaying(false);
    }
  }, [total, loadMetrics]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dlq-page">
      <Navbar user={user} logout={logout} title="Dead Letter Queue" />

      <main className="dlq-main">

        {/* ── Toast ─────────────────────────────────────────────────────── */}
        {toast && (
          <div className={`dlq-toast dlq-toast--${toast.type}`} role="alert">
            {toast.type === "success"
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            }
            {toast.msg}
          </div>
        )}

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="dlq-header">
          <div className="dlq-header-left">
            <div className="dlq-header-eyebrow">Fault Tolerance</div>
            <h1>Dead Letter Queue</h1>
            <p>Logs that exhausted all retry attempts. Replay them once Elasticsearch is healthy.</p>
          </div>

          <div className="dlq-header-actions">
            <label className="dlq-auto-refresh">
              <span className={`dlq-ar-dot ${autoRefresh ? "dlq-ar-dot--on" : ""}`} />
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh (10s)
            </label>

            <button
              className="dlq-btn dlq-btn-ghost"
              onClick={refresh}
              disabled={loading}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              Refresh
            </button>

            {isAdmin && total > 0 && (
              <button
                className="dlq-btn dlq-btn-primary"
                onClick={handleReplayAll}
                disabled={bulkReplaying}
              >
                {bulkReplaying
                  ? <><span className="dlq-spinner-xs" />Replaying all…</>
                  : <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      Replay All ({total})
                    </>
                }
              </button>
            )}
          </div>
        </div>

        {/* ── Metrics stat cards ──────────────────────────────────────────── */}
        <div className="dlq-stats">
          <StatCard
            label="In DLQ"
            value={metricsLoading ? "…" : (metrics?.dlqDepth ?? total)}
            accent="danger"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            }
          />
          <StatCard
            label="Pending Retries"
            value={metricsLoading ? "…" : (metrics?.pendingRetries ?? "—")}
            accent="warn"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            }
          />
          <StatCard
            label="Total Replayed"
            value={metricsLoading ? "…" : (metrics?.replayCount ?? "—")}
            accent="success"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            }
          />
          <StatCard
            label="Total Failures"
            value={metricsLoading ? "…" : (metrics?.failureCount ?? "—")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            }
          />
          <StatCard
            label="Retry Attempts"
            value={metricsLoading ? "…" : (metrics?.retryCount ?? "—")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            }
          />
          <StatCard
            label="Avg Retry Delay"
            value={metricsLoading ? "…" : (metrics?.avgRetryDelayMs != null ? `${metrics.avgRetryDelayMs}ms` : "—")}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }
          />
        </div>

        {/* ── Error banner ───────────────────────────────────────────────── */}
        {error && (
          <div className="dlq-error-banner" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="dlq-table-wrap">
          {loading && entries.length === 0 ? (
            <div className="dlq-loading">
              <div className="dlq-spinner" />
              <span>Loading DLQ entries…</span>
            </div>
          ) : entries.length === 0 && !error ? (
            <div className="dlq-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <h3>DLQ is empty</h3>
              <p>All logs are being ingested successfully. Check back when Elasticsearch has downtime.</p>
            </div>
          ) : (
            <table className="dlq-table">
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Service</th>
                  <th>Endpoint</th>
                  <th>Message</th>
                  <th>Error</th>
                  <th>Failed At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <DLQRow
                    key={entry.id}
                    entry={entry}
                    isAdmin={isAdmin}
                    onReplay={handleReplay}
                    onDelete={handleDelete}
                    replayingId={replayingId}
                    deletingId={deletingId}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Load more ──────────────────────────────────────────────────── */}
        {nextCursor && (
          <div className="dlq-load-more">
            <button
              className="dlq-btn dlq-btn-ghost"
              onClick={() => loadEntries(nextCursor, true)}
              disabled={loading}
            >
              {loading ? "Loading…" : `Load more (showing ${entries.length} of ${total})`}
            </button>
          </div>
        )}

        {/* ── Pipeline legend ─────────────────────────────────────────────── */}
        <div className="dlq-legend">
          <span className="dlq-legend-title">Retry Schedule</span>
          <div className="dlq-legend-steps">
            <div className="dlq-step"><span className="dlq-badge badge-attempt-1">Attempt 1</span><span className="dlq-step-arrow">→</span><span className="dlq-step-delay">1s</span></div>
            <div className="dlq-step"><span className="dlq-badge badge-attempt-2">Attempt 2</span><span className="dlq-step-arrow">→</span><span className="dlq-step-delay">2s</span></div>
            <div className="dlq-step"><span className="dlq-badge badge-attempt-3">Attempt 3</span><span className="dlq-step-arrow">→</span><span className="dlq-step-delay">4s</span></div>
            <div className="dlq-step"><span className="dlq-badge badge-attempt-4">Attempt 4</span><span className="dlq-step-arrow">→</span><span className="dlq-step-delay">8s</span></div>
            <div className="dlq-step"><span className="dlq-badge badge-dlq">DLQ</span><span className="dlq-step-arrow">→</span><span className="dlq-step-delay">Manual replay</span></div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default DLQPage;
