import "../styles/logfilters.css";

function LogFilters({ filter, setFilter }) {
  const types = ["ALL", "INFO", "WARN", "ERROR"];

  return (
    <div className="filters">
      {types.map((type) => (
        <button
          key={type}
          className={filter === type ? "active" : ""}
          onClick={() => setFilter(type)}
        >
          {type}
        </button>
      ))}
    </div>
  );
}

export default LogFilters;