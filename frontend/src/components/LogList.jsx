import "../styles/LogList.css";

function LogList({ logs, filter }) {
  const filteredLogs =
    filter === "ALL" ? logs : logs.filter((l) => l.level === filter);

  if (filteredLogs.length === 0) {
    return (
      <div className="log-list">
        <div className="log-empty">No logs to display.</div>
      </div>
    );
  }

  return (
    <div className="log-list">
      {filteredLogs.map((log, index) => (
        <div key={index} className={`log-item ${log.level}`}>
          <div className="log-item-message">
            <span className="log-item-level">{log.level}</span>
            <span className="log-item-text">{log.message}</span>
          </div>
          <span className="log-item-time">{log.timestamp}</span>
        </div>
      ))}
    </div>
  );
}

export default LogList;