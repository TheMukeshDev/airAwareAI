import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../../lib/utils";

const axis = {
  stroke: "#4a5d70",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-hairline bg-ink-850/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-[11px] text-slate-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-0.5 text-[12.5px] font-medium text-slate-100">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
          {formatNumber(entry.value)}
          {unit ? <span className="ml-1 text-slate-400">{unit}</span> : null}
        </p>
      ))}
    </div>
  );
}

function chartSummary(data, label, unit) {
  if (!data?.length) return `${label}. No data available.`;
  const points = data
    .slice(0, 8)
    .map((row) => `${row.label ?? "Point"}: ${formatNumber(row.value)}${unit ? ` ${unit}` : ""}`)
    .join(", ");
  return `${label}. ${points}${data.length > 8 ? `, and ${data.length - 8} more points` : ""}.`;
}

function DataTable({ data, valueLabel = "Value", unit }) {
  if (!data?.length) return null;
  return (
    <table className="sr-only">
      <caption>Chart data</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">{valueLabel}{unit ? ` (${unit})` : ""}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={row.label ?? index}>
            <td>{row.label}</td>
            <td>{formatNumber(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrendChart({ data, dataKey = "value", color = "#3fe0ac", unit, height = 220, area = true, ariaLabel = "Trend chart" }) {
  const Chart = area ? AreaChart : LineChart;
  const safeData = data ?? [];
  return (
    <figure role="img" aria-label={ariaLabel}>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <Chart data={safeData} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${dataKey}-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#16283a" vertical={false} />
            <XAxis dataKey="label" {...axis} dy={6} minTickGap={22} />
            <YAxis {...axis} width={44} />
            <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: "#2b4256", strokeDasharray: "4 4" }} />
            {area ? (
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${dataKey}-${color.replace("#", "")})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#050a10" }}
              />
            ) : (
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{chartSummary(safeData, ariaLabel, unit)}</figcaption>
      <DataTable data={safeData} valueLabel="Value" unit={unit} />
    </figure>
  );
}

export function SimpleBarChart({ data, dataKey = "value", unit, height = 200, colors, color = "#38bdf8", ariaLabel = "Bar chart" }) {
  const safeData = data ?? [];
  return (
    <figure role="img" aria-label={ariaLabel}>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={safeData} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="#16283a" vertical={false} />
            <XAxis dataKey="label" {...axis} dy={6} />
            <YAxis {...axis} width={44} />
            <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey={dataKey} radius={[6, 6, 2, 2]} maxBarSize={34}>
              {safeData.map((entry, index) => (
                <Cell key={entry.label ?? index} fill={colors?.[index % colors.length] ?? color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{chartSummary(safeData, ariaLabel, unit)}</figcaption>
      <DataTable data={safeData} valueLabel="Value" unit={unit} />
    </figure>
  );
}


export default TrendChart;
