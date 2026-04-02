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
  "1h":  60 * 60 * 1000,
  "6h":  6  * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d":  24 * 60 * 60 * 1000,
  "3d":  3  * 24 * 60 * 60 * 1000,
  "7d":  7  * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};

function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLive, setIsLive] = useState(true);
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

  /* Derived start time */
  const startTime = useMemo(() => {
    if (filters.duration === "ALL") return null;
    const ms = DURATION_MS[filters.duration];
    return ms ? new Date(Date.now() - ms).toISOString() : null;
  }, [filters.duration]);

  /* Parse key:value tokens from the search string.
     e.g. "level:info service:auth some text"
       → { level: "INFO", service: "auth", freeText: "some text" } */
  const LEVEL_ALIASES = { warning: "WARN", fatal: "ERROR" };
  const parsedSearch = useMemo(() => {
    const result = { level: null, service: null, freeText: "" };
    const freeTokens = [];
    for (const token of searchQuery.trim().split(/\s+/)) {
      if (!token) continue;
      if (token.startsWith("level:")) {
        const raw = token.slice(6).toUpperCase();
        result.level = LEVEL_ALIASES[raw.toLowerCase()] ?? raw;
      } else if (token.startsWith("service:")) {
        result.service = token.slice(8);
      } else {
        freeTokens.push(token);
      }
    }
    result.freeText = freeTokens.join(" ");
    return result;
  }, [searchQuery]);

  /* Fetch */
  const fetchPage = useCallback(async (pageNum, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
      if (startTime) params.set("start", startTime);

      // Parsed key:value tokens take priority over sidebar filters
      const levelParam = parsedSearch.level || (filters.levels?.length === 1 ? filters.levels[0] : null);
      const serviceParam = parsedSearch.service || filters.service || null;
      if (parsedSearch.freeText) params.set("search", parsedSearch.freeText);
      if (levelParam) params.set("level", levelParam);
      if (serviceParam) params.set("service", serviceParam);

      const res = await fetch(`${SOCKET_URL}/logs?${params}`);
      const data = await res.json();
      setLogs((prev) => (reset ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [startTime, parsedSearch, filters.levels, filters.service]);

  useEffect(() => {
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  /* Socket.io */
  useEffect(() => {
    if (!isLive) return;
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.on("new-log", (log) => {
      if (startTime && new Date(log.timestamp) < new Date(startTime)) return;
      setLogs((prev) => [log, ...prev]);
    });
    return () => socket.disconnect();
  }, [startTime, isLive]);

  /* Handlers */
  const handleLoadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, false);
  }, [page, fetchPage]);

  const handleRefresh = () => { setPage(1); fetchPage(1, true); };

  const handleExport = () => {
    const json = JSON.stringify(filteredLogs, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logbox-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Client-side filter — mirrors server-side logic for live-streamed logs */
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Level: parsed token wins over sidebar checkboxes
    const activeLevels = parsedSearch.level
      ? [parsedSearch.level]
      : filters.levels;
    if (activeLevels.length > 0) {
      result = result.filter((l) => activeLevels.includes(l.level));
    }

    // Service: parsed token wins
    const activeService = parsedSearch.service || filters.service;
    if (activeService) {
      result = result.filter((l) => l.service?.toLowerCase() === activeService.toLowerCase());
    }

    // Free text against message
    if (parsedSearch.freeText) {
      const q = parsedSearch.freeText.toLowerCase();
      result = result.filter((l) =>
        l.message?.toLowerCase().includes(q) ||
        l.service?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [logs, filters.levels, filters.service, parsedSearch]);

  /* Per-level counts for sidebar badges */
  const logCounts = useMemo(() => {
    const counts = { WARN: 0, ERROR: 0, DEBUG: 0 };
    logs.forEach((l) => { if (counts[l.level] !== undefined) counts[l.level]++; });
    return counts;
  }, [logs]);

  return (
    <div className="vdash">
      <Navbar user={user} logout={logout} />

      <div className="vdash-body">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((p) => !p)}
          filters={filters}
          onFilterChange={setFilters}
          logCounts={logCounts}
        />

        <main className="vdash-main">
          <LogToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLive={isLive}
            onToggleLive={() => setIsLive((p) => !p)}
            onRefresh={handleRefresh}
            onExport={handleExport}
            loading={loading}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(true)}
          />

          <LogTable
            logs={filteredLogs}
            hasMore={hasMore}
            loading={loading}
            onLoadMore={handleLoadMore}
          />
        </main>
      </div>
    </div>
  );
}

export default AdminDashboard;