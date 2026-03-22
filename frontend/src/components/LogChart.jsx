import "../styles/LogChart.css";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

function LogChart({ logs }) {
  const grouped = {};

  logs.forEach((log) => {
    const date = new Date(log.timestamp);

    // Full date+minute bucket key — ensures different days never collide
    const bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    // Short human-readable X-axis label (date shown only when it changes)
    const label = date.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    if (!grouped[bucketKey]) {
      grouped[bucketKey] = { bucketKey, label, INFO: 0, WARN: 0, ERROR: 0, DEBUG: 0 };
    }

    grouped[bucketKey][log.level]++;
  });

  // Sort ascending by the ISO-style bucket key so chart is left→right chronological
  const data = Object.values(grouped).sort((a, b) =>
    a.bucketKey.localeCompare(b.bucketKey)
  );

  return (
    <div className="chart">
      <h3>Logs over Time</h3>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="none" />

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              stroke="#aaa"
              tick={{ fontSize: 11 }}
            />

            <YAxis hide />

            <Tooltip
              contentStyle={{
                backgroundColor: "#1f1f1f",
                border: "none",
                color: "#fff",
                borderRadius: "6px",
              }}
              cursor={{ fill: "transparent" }}
            />

            <Bar dataKey="INFO" stackId="a" fill="#4dabf7" activeBar={{ fill: "#339af0" }} />
            <Bar dataKey="WARN" stackId="a" fill="#f59f00" activeBar={{ fill: "#f08c00" }} />
            <Bar dataKey="ERROR" stackId="a" fill="#fa5252" activeBar={{ fill: "#e03131" }} />
            <Bar dataKey="DEBUG" stackId="a" fill="#a855f7" activeBar={{ fill: "#9333ea" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend — lives inside the card, outside the SVG */}
      <div className="chart-legend">
        {[
          { key: "INFO",  color: "#4dabf7" },
          { key: "WARN",  color: "#f59f00" },
          { key: "ERROR", color: "#fa5252" },
          { key: "DEBUG", color: "#a855f7" },
        ].map(({ key, color }) => (
          <span key={key} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: color }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LogChart;
