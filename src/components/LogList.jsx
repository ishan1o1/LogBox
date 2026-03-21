import "../styles/loglist.css";

function LogList({ logs, filter }) {
  const filteredLogs =
    filter === "ALL" ? logs : logs.filter(l => l.level === filter);

  return (
    <div className="log-list">
      {filteredLogs.map((log, index) => (
        <div key={index} className={`log-item ${log.level}`}>
          <p><strong>{log.level}</strong> - {log.message}</p>
          <span>{log.timestamp}</span>
        </div>
      ))}
    </div>
  );
}

export default LogList;