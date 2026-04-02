import { useState } from "react";
import "../styles/Sidebar.css";

const LEVEL_OPTIONS = [
  { key: "WARN",  label: "Warning" },
  { key: "ERROR", label: "Error" },
  { key: "DEBUG", label: "Fatal" },
];

function Sidebar({ isOpen, onToggle, filters, onFilterChange, logCounts }) {
  const [expandedSections, setExpandedSections] = useState({
    timeline: true,
    level: true,
    resource: false,
    environment: false,
    route: false,
    requestPath: false,
    statusCode: false,
    requestType: false,
    host: false,
    requestMethod: false,
    cache: false,
    branch: false,
    deploymentId: false,
  });

  const toggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleLevel = (level) => {
    const cur = filters.levels || [];
    const next = cur.includes(level) ? cur.filter((l) => l !== level) : [...cur, level];
    onFilterChange({ ...filters, levels: next });
  };

  const activeCount = () => {
    let n = 0;
    if (filters.levels?.length) n += filters.levels.length;
    if (filters.service) n++;
    return n;
  };

  const resetFilters = () => {
    onFilterChange({
      duration: "30m",
      search: "",
      levels: [],
      statusCodes: [],
      environments: [],
      route: "",
      resource: "",
      service: "",
    });
  };

  /* Simple section: just a clickable row with chevron */
  const Section = ({ id, label }) => (
    <button className="sb-row" onClick={() => toggleSection(id)}>
      <svg className={`sb-chev ${expandedSections[id] ? "open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M3 2l4 3.5L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>{label}</span>
    </button>
  );

  const durations = [
    { label: "Last 30 minutes", value: "30m" },
    { label: "Last 1 hour", value: "1h" },
    { label: "Last 6 hours", value: "6h" },
    { label: "Last 12 hours", value: "12h" },
    { label: "Last 1 day", value: "1d" },
    { label: "Last 3 days", value: "3d" },
    { label: "All Time", value: "ALL" },
  ];

  return (
    <aside className={`sb ${isOpen ? "open" : "closed"}`}>
      {/* back + Logs */}
      <div className="sb-nav">
        <button className="sb-back" onClick={onToggle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <span className="sb-nav-label">Logs</span>
      </div>

      {/* Filters header */}
      <div className="sb-filters-head">
        <span className="sb-filters-title">Filters</span>
        {activeCount() > 0 && (
          <button className="sb-reset" onClick={resetFilters}>Reset</button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="sb-body">

        {/* ── Timeline ── */}
        <div className="sb-section">
          <button className="sb-section-head" onClick={() => toggleSection("timeline")}>
            <svg className={`sb-chev ${expandedSections.timeline ? "open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 2l4 3.5L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Timeline</span>
          </button>
          {expandedSections.timeline && (
            <div className="sb-section-body">
              <div className="sb-duration-select">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <select
                  value={filters.duration}
                  onChange={(e) => onFilterChange({ ...filters, duration: e.target.value })}
                >
                  {durations.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <svg className="sb-select-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* ── Contains Console Level ── */}
        <div className="sb-section">
          <button className="sb-section-head" onClick={() => toggleSection("level")}>
            <svg className={`sb-chev ${expandedSections.level ? "open" : ""}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 2l4 3.5L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Contains Console Level</span>
          </button>
          {expandedSections.level && (
            <div className="sb-section-body">
              {LEVEL_OPTIONS.map(({ key, label }) => {
                const count = logCounts?.[key] || 0;
                const active = filters.levels?.includes(key);
                return (
                  <label key={key} className={`sb-check ${active ? "active" : ""}`}>
                    <input type="checkbox" checked={active || false} onChange={() => toggleLevel(key)} />
                    <span className="sb-check-box" />
                    <span className="sb-check-label">{label}</span>
                    <span className="sb-check-count">{count}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Other sections (collapsible rows) ── */}
        <Section id="resource" label="Resource" />
        <Section id="environment" label="Environment" />
        <Section id="route" label="Route" />
        <Section id="requestPath" label="Request Path" />
        <Section id="statusCode" label="Status Code" />
        <Section id="requestType" label="Request Type" />
        <Section id="host" label="Host" />
        <Section id="requestMethod" label="Request Method" />
        <Section id="cache" label="Cache" />
        <Section id="branch" label="Branch" />
        <Section id="deploymentId" label="Deployment ID" />
      </div>

      {/* Bottom user */}
      <div className="sb-bottom">
        <div className="sb-user">
          <div className="sb-user-avatar">{(filters._userName || "U")[0]}</div>
          <span className="sb-user-name">{filters._userName || "user"}</span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
