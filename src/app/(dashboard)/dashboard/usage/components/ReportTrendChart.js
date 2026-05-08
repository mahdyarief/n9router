"use client";

import PropTypes from "prop-types";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Card from "@/shared/components/Card";

const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#06b6d4", "#10b981",
  "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6",
];

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};
const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;
const fmtNum = (n) => new Intl.NumberFormat().format(n || 0);

function getFormatter(metric) {
  if (metric === "cost") return fmtCost;
  if (metric === "tokens" || metric === "cachedTokens") return fmtTokens;
  return fmtNum;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#16161e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e2e8f0",
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
};

const TOOLTIP_LABEL_STYLE = { color: "#94a3b8", marginBottom: 2 };
const TOOLTIP_ITEM_STYLE  = { color: "#f1f5f9" };

function TrendChart({ series, metric, seriesBy }) {
  if (!series?.length) return null;
  const fmt = getFormatter(metric);

  // Collect all series keys
  const seriesKeys = [...new Set(series.flatMap((b) => Object.keys(b.values || {})))];
  // Ensure every data point has all keys (default 0) — recharts skips undefined in stacked areas
  const defaults = Object.fromEntries(seriesKeys.map((k) => [k, 0]));
  const chartData = series.map((b) => ({ ...defaults, label: b.label, ...b.values }));

  const showMulti = seriesBy !== "none" && seriesKeys.length > 1;
  const hasData = series.some((b) => b.total > 0);

  if (!hasData) {
    return (
      <Card className="flex items-center justify-center h-[260px] text-text-muted text-sm">
        No data for selected filters
      </Card>
    );
  }

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-text-muted uppercase">Trend</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {CHART_COLORS.map((color, i) => (
              <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={52} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value, name) => [fmt(value), name]}
          />
          {showMulti && <Legend wrapperStyle={{ fontSize: "11px" }} />}
          {showMulti
            ? seriesKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  fill={`url(#grad${i % CHART_COLORS.length})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  stackId="1"
                />
              ))
            : (
              <Area
                type="monotone"
                dataKey={seriesKeys[0] || "total"}
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                fill="url(#grad0)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )
          }
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

function TopContributorsChart({ top, metric }) {
  if (!top?.length) return null;
  const fmt = getFormatter(metric);
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-text-muted uppercase">Top Contributors</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }} tickLine={false} axisLine={false} tickFormatter={fmt} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.7 }} tickLine={false} axisLine={false} width={90} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(v) => [fmt(v)]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {top.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function ShareChart({ top, metric }) {
  if (!top?.length) return null;
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-text-muted uppercase">Share</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={top}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {top.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(_, name, props) => [`${props.payload.percentage}%`, name]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: "11px" }}
            formatter={(value) => value.length > 14 ? value.slice(0, 12) + "…" : value}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

export default function ReportTrendChart({ report, metric, seriesBy, groupBy }) {
  const top = report?.top || {};

  // Each dimension gets its own pair of charts
  const dimensions = [
    { key: "apiKeys",   label: "API Key",  data: top.apiKeys   || [] },
    { key: "models",    label: "Model",    data: top.models    || [] },
    { key: "providers", label: "Provider", data: top.providers || [] },
  ];

  // Filter out dimensions with no data
  const activeDimensions = dimensions.filter((d) => d.data.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TrendChart series={report?.series} metric={metric} seriesBy={seriesBy} />

      {activeDimensions.map((dim) => (
        <div key={dim.key} className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-semibold uppercase text-text-muted px-0.5">
            {dim.label} breakdown
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <TopContributorsChart top={dim.data} metric={metric} />
            <ShareChart top={dim.data} metric={metric} />
          </div>
        </div>
      ))}
    </div>
  );
}

ReportTrendChart.propTypes = {
  report: PropTypes.object,
  metric: PropTypes.string,
  seriesBy: PropTypes.string,
  groupBy: PropTypes.string,
};

TrendChart.propTypes = { series: PropTypes.array, metric: PropTypes.string, seriesBy: PropTypes.string };
TopContributorsChart.propTypes = { top: PropTypes.array, metric: PropTypes.string };
ShareChart.propTypes = { top: PropTypes.array, metric: PropTypes.string };

