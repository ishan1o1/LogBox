import { useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";

import Navbar from "../components/Navbar";
import LogChart from "../components/LogChart";
import LogList from "../components/LogList";
import LogFilters from "../components/LogFilters";
import LogDurationFilter from "../components/LogDurationFilter";
import ErrorRateCards from "../components/ErrorRateCards";

import "../styles/dashboard.css";

const PAGE_SIZE = 50;
const SOCKET_URL = "http://localhost:4000";

// Duration label → milliseconds offset from now
const DURATION_MS = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h":  1  * 60 * 60 * 1000,
  "6h":  6  * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d":  24 * 60 * 60 * 1000,
  "3d":  3  * 24 * 60 * 60 * 1000,
};

function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [duration, setDuration] = useState("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // Signals the chart to re-fetch stats (incremented on new live log)
  const [chartVersion, setChartVersion] = useState(0);

  // Debounce timer ref — avoid re-fetching chart on every single arriving log
  const chartDebounceRef = useRef(null);

  // ✅ Derive a stable ISO start time from the selected duration
  const startTime = useMemo(() => {
    if (duration === "ALL") return null;
    const ms = DURATION_MS[duration];
    if (!ms) return null;
    return new Date(Date.now() - ms).toISOString();
  }, [duration]);

  // ✅ Core paginated fetch
  const fetchPage = useCallback(async (pageNum, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
      if (startTime) params.set("start", startTime);

      const res = await fetch(`${SOCKET_URL}/logs?${params}`);
      const data = await res.json();
      setLogs((prev) => (reset ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }, [startTime]);

  // ✅ Reset list whenever duration changes
  useEffect(() => {
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]);

  // ✅ Socket.io — live incoming logs
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      console.log("⚡ Socket connected:", socket.id);
    });

    socket.on("new-log", (log) => {
      // Only prepend if the log falls within the selected duration window
      if (startTime && new Date(log.timestamp) < new Date(startTime)) return;

      setLogs((prev) => [log, ...prev]);

      // Debounce chart refresh — wait 1.5 s of silence before re-fetching stats
      if (chartDebounceRef.current) clearTimeout(chartDebounceRef.current);
      chartDebounceRef.current = setTimeout(() => {
        setChartVersion((v) => v + 1);
      }, 1500);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected");
    });

    return () => {
      socket.disconnect();
      if (chartDebounceRef.current) clearTimeout(chartDebounceRef.current);
    };
  }, [startTime]); // reconnect when duration window changes

  // ✅ Load More handler
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPage(nextPage, false);
  };

  // ✅ Client-side level filter on top of paginated + live results
  const filteredLogs =
    filter === "ALL" ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="dashboard-container">
      <Navbar user={user} logout={logout} />

      <div className="dashboard-content">

        {/* Duration Dropdown */}
        <LogDurationFilter duration={duration} setDuration={setDuration} />

        {/* Error Rate Cards fetches stats too via /logs/error-rate */}
        <ErrorRateCards startTime={startTime} version={chartVersion} />

        {/* Chart fetches ALL stats independently via /logs/stats */}
        <LogChart startTime={startTime} version={chartVersion} />

        {/* Level filter buttons */}
        <LogFilters filter={filter} setFilter={setFilter} />

        {/* List shows paginated + live + level-filtered logs */}
        <LogList logs={filteredLogs} filter={filter} />

        {/* Load More / status row */}
        <div className="load-more-row">
          <span className="log-count-label">
            Showing {filteredLogs.length} log{filteredLogs.length !== 1 ? "s" : ""}
            {filter !== "ALL" ? ` (${filter} filtered)` : ""}
          </span>

          {hasMore && (
            <button
              id="load-more-btn"
              className="load-more-btn"
              onClick={handleLoadMore}
              disabled={loading}
            >
              {loading ? "Loading…" : "Load More"}
            </button>
          )}

          {!hasMore && logs.length > 0 && (
            <span className="no-more-label">All logs loaded</span>
          )}
        </div>

      </div>
    </div>
  );
}

export default AdminDashboard;