import { useContext, useEffect, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import LogToolbar from "../components/LogToolbar";
import LogTable from "../components/LogTable";

import "../styles/dashboard.css";

const PAGE_SIZE = 50;
const SOCKET_URL = "http://localhost:4000";

const DURATION_MS = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

const LEVEL_ALIASES = { warning: "WARN", fatal: "ERROR", critical: "ERROR" };

const CLIENT_FIELD_MAP = {
  status: { field: "statusCode", numeric: true },
  statuscode: { field: "statusCode", numeric: true },
  responsetime: { field: "responseTime", numeric: true },
  method: { field: "method", numeric: false },
  route: { field: "route", numeric: false },
  endpoint: { field: "endpoint", numeric: false },
  requestid: { field: "requestId", numeric: false },
  traceid: { field: "traceId", numeric: false },
  deploymentid: { field: "deploymentId", numeric: false },
  errortype: { field: "errorType", numeric: false },
  environment: { field: "environment", numeric: false },
  source: { field: "source", numeric: false },
  host: { field: "host", numeric: false },
  module: { field: "module", numeric: false },
};

function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [viewMode, setViewMode] = useState("raw");
  const [searchQuery, setSearchQuery] = useState("");

  const [filters, setFilters] = useState({
    duration: "30m",
    search: "",
    levels: [],
    statusCodes: [],
    environments: [],
    route: "",
    resource: "",
    service: "",
    _userName: user?.name || "user",
  });

  const startTime = useMemo(() => {
    if (filters.duration === "ALL") return null;
    const ms = DURATION_MS[filters.duration];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }, [filters.duration]);

  const parsedSearch = useMemo(() => {
    const result = { level: null, service: null, meta: {}, freeText: "" };
    const freeTokens = [];

    for (const token of searchQuery.trim().split(/\s+/)) {
      if (!token) continue;
      const colonIdx = token.indexOf(":");
      if (colonIdx > 0) {
        const key = token.slice(0, colonIdx).toLowerCase();
        const value = token.slice(colonIdx + 1);
        if (!value) {
          freeTokens.push(token);
          continue;
        }
        if (key === "level") {
          const raw = value.toUpperCase();
          result.level = LEVEL_ALIASES[raw.toLowerCase()] ?? raw;
        } else if (key === "service") {
          result.service = value;
        } else {
          result.meta[key] = value;
        }
      } else {
        freeTokens.push(token);
      }
    }

    result.freeText = freeTokens.join(" ");
    return result;
  }, [searchQuery]);

  const fetchPage = useCallback(async (pageNum, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
      if (startTime) params.set("start", startTime);

      const levelParam = parsedSearch.level || (filters.levels?.length === 1 ? filters.levels[0] : null);
      const serviceParam = parsedSearch.service || filters.service || null;

      if (parsedSearch.freeText) params.set("search", parsedSearch.freeText);
      if (levelParam) params.set("level", levelParam);
      if (serviceParam) params.set("service", serviceParam);

      for (const [key, value] of Object.entries(parsedSearch.meta)) {
        if (value) params.set(`meta.${key}`, value);
      }

      const res = await fetch(`${SOCKET_URL}/logs?${params.toString()}`);
      const data = await res.json();
      setLogs((prev) => (reset ? data : [...prev, ...data]));
      setHasMore(Array.isArray(data) && data.length === PAGE_SIZE);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [filters.levels, filters.service, parsedSearch, startTime]);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const levelParam = parsedSearch.level || (filters.levels?.length === 1 ? filters.levels[0] : null);
      const routeParam = parsedSearch.meta.route || filters.route || "";
      const moduleParam = parsedSearch.meta.module || "";

      if (levelParam) params.set("level", levelParam.toLowerCase());
      if (routeParam) params.set("route", routeParam);
      if (moduleParam) params.set("module", moduleParam);
      if (startTime) params.set("from", startTime);
      params.set("to", new Date().toISOString());

      const res = await fetch(`${SOCKET_URL}/rca/incidents?${params.toString()}`);
      const data = await res.json();
      setIncidents(data.incidents || []);
      setHasMore(false);
    } catch (err) {
      console.error("Fetch incidents error:", err);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [filters.levels, filters.route, parsedSearch.level, parsedSearch.meta.module, parsedSearch.meta.route, startTime]);

  useEffect(() => {
    setPage(1);
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }
    fetchPage(1, true);
  }, [fetchIncidents, fetchPage, viewMode]);

  useEffect(() => {
    if (!isLive || viewMode !== "raw") return undefined;
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.on("new-log", (log) => {
      const logTimestamp = log.timestamp || log["@timestamp"];
      if (startTime && logTimestamp && new Date(logTimestamp) < new Date(startTime)) return;
      setLogs((prev) => [log, ...prev]);
    });
    return () => socket.disconnect();
  }, [isLive, startTime, viewMode]);

  const handleLoadMore = useCallback(() => {
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  }, [fetchIncidents, fetchPage, page, viewMode]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    if (viewMode === "grouped") {
      fetchIncidents();
      return;
    }
    fetchPage(1, true);
  }, [fetchIncidents, fetchPage, viewMode]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    const activeLevels = parsedSearch.level ? [parsedSearch.level] : filters.levels;
    if (activeLevels.length > 0) {
      result = result.filter((log) => activeLevels.includes(log.level?.toUpperCase()));
    }

    const activeService = parsedSearch.service || filters.service;
    if (activeService) {
      result = result.filter((log) => log.service?.toLowerCase() === activeService.toLowerCase());
    }

    for (const [key, value] of Object.entries(parsedSearch.meta)) {
      if (!value) continue;
      const mapping = CLIENT_FIELD_MAP[key.toLowerCase()];
      const fieldName = mapping?.field ?? key;

      result = result.filter((log) => {
        const fieldVal = log[fieldName] ?? log.meta?.[fieldName];
        if (fieldVal == null) return false;
        if (mapping?.numeric) {
          return Number(fieldVal) === Number(value);
        }
        return String(fieldVal).toLowerCase().includes(value.toLowerCase());
      });
    }

    if (parsedSearch.freeText) {
      const query = parsedSearch.freeText.toLowerCase();
      result = result.filter((log) =>
        log.message?.toLowerCase().includes(query) ||
        log.service?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [filters.levels, filters.service, logs, parsedSearch]);

  const handleExport = () => {
    const payload = viewMode === "grouped" ? incidents : filteredLogs;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix = viewMode === "grouped" ? "incidents" : "logs";
    a.href = url;
    a.download = `logbox-${suffix}-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const logCounts = useMemo(() => {
    const counts = { WARN: 0, ERROR: 0, DEBUG: 0 };
    logs.forEach((log) => {
      if (counts[log.level] !== undefined) counts[log.level] += 1;
    });
    return counts;
  }, [logs]);

  return (
    <div className="vdash">
      <Navbar user={user} logout={logout} />

      <div className="vdash-body">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
          filters={filters}
          onFilterChange={setFilters}
          logCounts={logCounts}
        />

        <main className="vdash-main">
          <LogToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLive={isLive}
            onToggleLive={() => setIsLive((prev) => !prev)}
            viewMode={viewMode}
            onToggleGrouped={() => setViewMode((prev) => (prev === "grouped" ? "raw" : "grouped"))}
            onRefresh={handleRefresh}
            onExport={handleExport}
            loading={loading}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(true)}
          />

          <LogTable
            logs={viewMode === "grouped" ? incidents : filteredLogs}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
            viewMode={viewMode}
          />
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;
