import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";

import Navbar from "../components/Navbar";
import LogChart from "../components/LogChart";
import LogList from "../components/LogList";
import LogFilters from "../components/LogFilters";
import LogDurationFilter from "../components/LogDurationFilter";

import "../styles/dashboard.css";

function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [duration, setDuration] = useState("ALL");

  // ✅ Fetch logs
  useEffect(() => {
    fetch("http://localhost:4000/logs")
      .then((res) => res.json())
      .then((data) => {
        setLogs(data);
      });
  }, []);

  // ✅ Duration Filter Logic
  const getFilteredByDuration = (logs) => {
    if (duration === "ALL") return logs;

    const now = new Date();
    let diff = 0;

    switch (duration) {
      case "15m":
        diff = 15 * 60 * 1000;
        break;
      case "30m":
        diff = 30 * 60 * 1000;
        break;
      case "1h":
        diff = 60 * 60 * 1000;
        break;
      case "6h":
        diff = 6 * 60 * 60 * 1000;
        break;
      case "12h":
        diff = 12 * 60 * 60 * 1000;
        break;
      case "1d":
        diff = 24 * 60 * 60 * 1000;
        break;
      case "3d":
        diff = 3 * 24 * 60 * 60 * 1000;
        break;
      default:
        return logs;
    }

    return logs.filter((log) => {
      const logTime = new Date(log.timestamp);
      return now - logTime <= diff;
    });
  };

  // ✅ Apply duration filter first
  const durationFilteredLogs = getFilteredByDuration(logs);

  return (
    <div className="dashboard-container">
      <Navbar user={user} logout={logout} />

      <div className="dashboard-content">
        
        {/* ✅ Duration Dropdown (Top) */}
        <LogDurationFilter
          duration={duration}
          setDuration={setDuration}
        />

        {/* ✅ Chart uses duration filtered logs */}
        <LogChart logs={durationFilteredLogs} />

        {/* ✅ Level filter buttons */}
        <LogFilters filter={filter} setFilter={setFilter} />

        {/* ✅ List uses BOTH filters */}
        <LogList logs={durationFilteredLogs} filter={filter} />
      </div>
    </div>
  );
}

export default AdminDashboard;