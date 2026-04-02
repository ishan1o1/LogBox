import { useState, useRef, useEffect } from "react";
import "../styles/LogTable.css";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

function LogTable({ logs, hasMore, loading, onLoadMore }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const tableRef = useRef(null);

  const toggleRow = (idx) => setExpandedRow((prev) => (prev === idx ? null : idx));

  /* Infinite scroll */
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const handler = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60 && hasMore && !loading) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, [hasMore, loading, onLoadMore]);

  if (logs.length === 0 && !loading) {
    return (
      <div className="lt-empty">
        <div className="lt-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
        </div>
        <p className="lt-empty-title">There are no runtime logs in this time range</p>
        <div className="lt-empty-actions">
          <button className="lt-empty-btn primary" onClick={onLoadMore}>Refresh Query</button>
          <button className="lt-empty-btn">Learn More</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lt-wrap" ref={tableRef}>
      {/* Timeline bar placeholder */}
      <div className="lt-timeline-bar">
        <div className="lt-timeline-line" />
      </div>

      {/* Column headers */}
      <div className="lt-header">
        <span className="lt-h lt-h-time">Time</span>
        <span className="lt-h lt-h-status">Status</span>
        <span className="lt-h lt-h-host">Host</span>
        <span className="lt-h lt-h-request">Request</span>
        <span className="lt-h lt-h-message">Messages</span>
      </div>

      {/* Rows */}
      <div className="lt-rows">
        {logs.map((log, idx) => (
          <div key={log._id || idx} className="lt-row-wrap">
            <button
              className={`lt-row ${expandedRow === idx ? "expanded" : ""}`}
              onClick={() => toggleRow(idx)}
            >
              <span className="lt-c lt-c-time">{fmtTime(log.timestamp)}</span>
              <span className="lt-c lt-c-status">{log.level}</span>
              <span className="lt-c lt-c-host">{log.service || "—"}</span>
              <span className="lt-c lt-c-request">{log.meta?.route || log.meta?.method || "—"}</span>
              <span className="lt-c lt-c-message">{log.message}</span>
            </button>

            {expandedRow === idx && (
              <div className="lt-detail">
                <div className="lt-detail-row">
                  <span className="lt-detail-key">Timestamp</span>
                  <span className="lt-detail-val">{new Date(log.timestamp).toISOString()}</span>
                </div>
                <div className="lt-detail-row">
                  <span className="lt-detail-key">Level</span>
                  <span className="lt-detail-val">{log.level}</span>
                </div>
                <div className="lt-detail-row">
                  <span className="lt-detail-key">Service</span>
                  <span className="lt-detail-val">{log.service || "N/A"}</span>
                </div>
                <div className="lt-detail-row">
                  <span className="lt-detail-key">Message</span>
                  <span className="lt-detail-val lt-detail-msg">{log.message}</span>
                </div>
                {log.meta && Object.keys(log.meta).length > 0 && (
                  <div className="lt-detail-row">
                    <span className="lt-detail-key">Meta</span>
                    <pre className="lt-detail-pre">{JSON.stringify(log.meta, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="lt-loading">
            <div className="lt-spinner" />
            <span>Loading…</span>
          </div>
        )}

        {!hasMore && logs.length > 0 && (
          <div className="lt-end">All logs loaded — {logs.length.toLocaleString()} total</div>
        )}
      </div>
    </div>
  );
}

export default LogTable;
