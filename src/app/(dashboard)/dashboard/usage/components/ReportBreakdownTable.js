"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;
const fmtPct = (n) => `${((n || 0) * 100).toFixed(1)}%`;

function fmtTime(iso) {
  if (!iso) return "—";
  const diffMins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function SortIcon({ field, currentSort, currentOrder }) {
  if (currentSort !== field) return <span className="ml-1 opacity-25 text-xs">↕</span>;
  return <span className="ml-1 text-xs">{currentOrder === "asc" ? "↑" : "↓"}</span>;
}

SortIcon.propTypes = { field: PropTypes.string, currentSort: PropTypes.string, currentOrder: PropTypes.string };

const COLUMNS = [
  { field: "requests", label: "Requests" },
  { field: "promptTokens", label: "Input" },
  { field: "completionTokens", label: "Output" },
  { field: "cachedTokens", label: "Cached" },
  { field: "totalTokens", label: "Total Tokens" },
  { field: "cost", label: "Cost" },
  { field: "avgCostPerRequest", label: "Avg/Req" },
  { field: "cacheHitRatio", label: "Cache %" },
  { field: "lastUsed", label: "Last Used" },
];

export default function ReportBreakdownTable({ breakdown, groupBy }) {
  const [sortField, setSortField] = useState("requests");
  const [sortOrder, setSortOrder] = useState("desc");

  if (!breakdown?.length) {
    return (
      <Card className="p-8 text-center text-text-muted text-sm">
        No usage data for selected filters.
      </Card>
    );
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortOrder("desc"); }
  };

  const sorted = [...breakdown].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    if (typeof av === "string") return sortOrder === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortOrder === "asc" ? av - bv : bv - av;
  });

  const labelHeader = { apiKey: "API Key", model: "Model", provider: "Provider", time: "Time Period" }[groupBy] || "Label";

  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border bg-bg-subtle/50">
        <h3 className="text-sm font-semibold text-text-main">Breakdown by {labelHeader}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[900px]">
          <thead className="bg-bg-subtle/30 text-text-muted uppercase text-xs">
            <tr>
              <th className="px-4 py-3 font-semibold">{labelHeader}</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.field}
                  className="px-3 py-3 text-right cursor-pointer hover:bg-bg-subtle/50 whitespace-nowrap"
                  onClick={() => toggleSort(col.field)}
                >
                  {col.label}
                  <SortIcon field={col.field} currentSort={sortField} currentOrder={sortOrder} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => (
              <tr key={row.id} className="hover:bg-bg-subtle/30 transition-colors">
                <td className="px-4 py-3 max-w-[200px]">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-text-main truncate">{row.label}</span>
                    {row.maskedKey && (
                      <span className="text-[10px] font-mono text-text-muted truncate">{row.maskedKey}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-text-main">{fmt(row.requests)}</td>
                <td className="px-3 py-3 text-right font-mono text-text-muted">{fmt(row.promptTokens)}</td>
                <td className="px-3 py-3 text-right font-mono text-text-muted">{fmt(row.completionTokens)}</td>
                <td className="px-3 py-3 text-right font-mono" style={{ color: "var(--color-info, #06b6d4)" }}>{fmt(row.cachedTokens)}</td>
                <td className="px-3 py-3 text-right font-mono font-medium">{fmt(row.totalTokens)}</td>
                <td className="px-3 py-3 text-right font-mono text-warning">{fmtCost(row.cost)}</td>
                <td className="px-3 py-3 text-right font-mono text-text-muted">{fmtCost(row.avgCostPerRequest)}</td>
                <td className="px-3 py-3 text-right font-mono text-text-muted">{fmtPct(row.cacheHitRatio)}</td>
                <td className="px-3 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(row.lastUsed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

ReportBreakdownTable.propTypes = {
  breakdown: PropTypes.array,
  groupBy: PropTypes.string,
};
