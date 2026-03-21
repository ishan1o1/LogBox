import "../styles/logchart.css";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

function LogChart({ logs }) {
  const grouped = {};

  // group logs by time (HH:MM)
  logs.forEach((log) => {
    const time = log.timestamp.slice(0, 5);

    if (!grouped[time]) {
      grouped[time] = { time, INFO: 0, WARN: 0, ERROR: 0 };
    }

    grouped[time][log.level]++;
  });

  const data = Object.values(grouped);

  return (
    <div className="chart">
      <h3>Logs over Time</h3>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            
            {/* ❌ remove grid */}
            <CartesianGrid stroke="none" />

            {/* ✅ only X axis */}
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              stroke="#aaa"
            />

            {/* ❌ hide Y axis */}
            <YAxis hide />

            {/* ✅ tooltip styling */}
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f1f1f",
                border: "none",
                color: "#fff",
                borderRadius: "6px",
              }}
              cursor={{ fill: "transparent" }} // 🔥 removes gray hover bg
            />

            <Legend />

            {/* ✅ bars with custom hover (no gray) */}
            <Bar
              dataKey="INFO"
              stackId="a"
              fill="#4dabf7"
              activeBar={{ fill: "#339af0" }}
            />
            <Bar
              dataKey="WARN"
              stackId="a"
              fill="#f59f00"
              activeBar={{ fill: "#f08c00" }}
            />
            <Bar
              dataKey="ERROR"
              stackId="a"
              fill="#fa5252"
              activeBar={{ fill: "#e03131" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default LogChart;