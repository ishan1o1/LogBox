import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import LogChart from "../components/LogChart";
import LogList from "../components/LogList";
import LogFilters from "../components/LogFilters";
import "../styles/dashboard.css";

function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);

  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");

   // ✅  dummy logs here
  const dummyLogs = [
    { level: "INFO", message: "Server started successfully", timestamp: "10:00:12" },
    { level: "WARN", message: "High memory usage detected", timestamp: "10:02:10" },
        { level: "ERROR", message: "Rahul Prasad", timestamp: "10:02:10" },
    { level: "ERROR", message: "Database connection failed", timestamp: "10:03:22" },
    { level: "INFO", message: "User login successful", timestamp: "10:04:45" },
        { level: "ERROR", message: "Payment failed", timestamp: "10:04:45" },
            { level: "WARN", message: "User login successful", timestamp: "10:04:45" },
    { level: "WARN", message: "Memory constraint", timestamp: "10:05:30" },
  ];

  // ✅ load logs on mount
  useEffect(() => {
    setLogs(dummyLogs);
  }, []);

  return (
    <div className="dashboard-container">
      <Navbar user={user} logout={logout} />

      <div className="dashboard-content">
        <LogChart logs={logs} />

        <LogFilters filter={filter} setFilter={setFilter} />

        <LogList logs={logs} filter={filter} />
      </div>
    </div>
  );
}

export default AdminDashboard;