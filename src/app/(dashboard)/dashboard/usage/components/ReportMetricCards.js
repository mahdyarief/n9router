"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function ReportMetricCards({ totals }) {
  const cacheRatio = totals?.promptTokens > 0
    ? ((totals.cachedTokens || 0) / totals.promptTokens * 100).toFixed(1)
    : "0.0";

  const cards = [
    { label: "Requests", value: fmt(totals?.requests), color: "text-primary" },
    { label: "Total Tokens", value: fmt(totals?.totalTokens), color: "text-text-main" },
    { label: "Input Tokens", value: fmt(totals?.promptTokens), color: "text-text-muted", sub: `${fmt(totals?.cachedTokens)} cached` },
    { label: "Est. Cost", value: `~${fmtCost(totals?.cost)}`, color: "text-warning", sub: "Estimated" },
    { label: "Avg Cost/Req", value: fmtCost(totals?.avgCostPerRequest), color: "text-text-main", sub: `${cacheRatio}% cache hit` },
  ];

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 sm:gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
          <span className="text-xs font-semibold uppercase text-text-muted">{c.label}</span>
          <span className={`truncate text-xl font-bold ${c.color}`}>{c.value}</span>
          {c.sub && <span className="text-[10px] text-text-muted">{c.sub}</span>}
        </Card>
      ))}
    </div>
  );
}

ReportMetricCards.propTypes = {
  totals: PropTypes.object,
};
