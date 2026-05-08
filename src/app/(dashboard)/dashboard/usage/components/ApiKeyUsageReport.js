"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CardSkeleton, Button, Card } from "@/shared/components";
import SegmentedControl from "@/shared/components/SegmentedControl";
import ReportMetricCards from "./ReportMetricCards";
import ReportTrendChart from "./ReportTrendChart";
import ReportBreakdownTable from "./ReportBreakdownTable";

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

const METRIC_OPTIONS = [
  { value: "requests", label: "Requests" },
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "cachedTokens", label: "Cached" },
];

const GROUP_OPTIONS = [
  { value: "all", label: "All" },
  { value: "apiKey", label: "API Key" },
  { value: "model", label: "Model" },
  { value: "provider", label: "Provider" },
];

const INTERVAL_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function buildParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      params.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
  });
  return params.toString();
}

export default function ApiKeyUsageReport() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filters from URL
  const [period, setPeriod] = useState(() => searchParams.get("r_period") || "7d");
  const [metric, setMetric] = useState(() => searchParams.get("r_metric") || "requests");
  const [groupBy, setGroupBy] = useState(() => searchParams.get("r_groupBy") || "all");
  const [granularity, setGranularity] = useState(() => searchParams.get("r_interval") || "day");
  const [apiKeyIds, setApiKeyIds] = useState(() => {
    const v = searchParams.get("r_apiKeyIds");
    return v ? v.split(",") : [];
  });

  // Available filter options loaded from /api/keys
  const [availableKeys, setAvailableKeys] = useState([]);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refetching, setRefetching] = useState(false);
  const abortRef = useRef(null);

  // Load available API keys for filter dropdown
  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => setAvailableKeys(d.keys || []))
      .catch(() => {});
  }, []);

  // Sync filter changes to URL (using r_ prefix to avoid colliding with tab params)
  const syncUrl = useCallback((newFilters) => {
    const current = new URLSearchParams(searchParams.toString());
    Object.entries(newFilters).forEach(([k, v]) => {
      const urlKey = `r_${k}`;
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        current.delete(urlKey);
      } else {
        current.set(urlKey, Array.isArray(v) ? v.join(",") : String(v));
      }
    });
    router.push(`/dashboard/usage?${current.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const fetchReport = useCallback(async (filters, isRefetch = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (isRefetch) setRefetching(true);
    else setLoading(true);
    setError(null);

    try {
      const qs = buildParams(filters);
      const res = await fetch(`/api/usage/report?${qs}`, { signal: controller.signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setReport(await res.json());
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, []);

  // Fetch on filter changes
  useEffect(() => {
    // When "all" is selected, send seriesBy=none for aggregate trend and groupBy=apiKey as fallback for breakdown
    const effectiveGroupBy = groupBy === "all" ? "apiKey" : groupBy;
    const effectiveSeriesBy = groupBy === "all" ? "none" : groupBy;
    const filters = { metric, groupBy: effectiveGroupBy, seriesBy: effectiveSeriesBy, apiKeyIds };

    // "today" → custom period from local midnight to now
    if (period === "today") {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filters.period = "custom";
      filters.startDate = midnight.toISOString();
      filters.endDate = now.toISOString();
      filters.interval = "hour";
    } else {
      filters.period = period;
      // Short ranges use hourly granularity automatically
      filters.interval = period === "24h" ? "hour" : granularity;
    }

    fetchReport(filters, report !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, metric, groupBy, granularity, apiKeyIds.join(",")]);

  const handlePeriod = (v) => { setPeriod(v); syncUrl({ period: v, metric, groupBy, interval: granularity }); };
  const handleMetric = (v) => { setMetric(v); syncUrl({ period, metric: v, groupBy, interval: granularity }); };
  const handleGroupBy = (v) => { setGroupBy(v); syncUrl({ period, metric, groupBy: v, interval: granularity }); };
  const handleInterval = (v) => { setGranularity(v); syncUrl({ period, metric, groupBy, interval: v }); };
  const handleToggleKey = (id) => {
    const next = apiKeyIds.includes(id) ? apiKeyIds.filter((k) => k !== id) : [...apiKeyIds, id];
    setApiKeyIds(next);
    syncUrl({ period, metric, groupBy, interval: granularity, apiKeyIds: next });
  };
  const handleClearKeys = () => {
    setApiKeyIds([]);
    syncUrl({ period, metric, groupBy, interval: granularity, apiKeyIds: [] });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 sm:gap-4">
          {[...Array(5)].map((_, i) => <CardSkeleton key={i} className="h-[72px]" />)}
        </div>
        <CardSkeleton className="h-[280px]" />
        <CardSkeleton className="h-[240px]" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="material-symbols-outlined text-3xl text-text-muted">error</span>
        <p className="text-text-muted text-sm">{error}</p>
        <Button size="sm" icon="refresh" onClick={() => fetchReport({ period, metric, groupBy, apiKeyIds })}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Filter Bar */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Period */}
          <SegmentedControl
            options={PERIOD_OPTIONS}
            value={period}
            onChange={handlePeriod}
            size="sm"
          />

          {/* Metric */}
          <SegmentedControl
            options={METRIC_OPTIONS}
            value={metric}
            onChange={handleMetric}
            size="sm"
          />

          {/* Group By */}
          <SegmentedControl
            options={GROUP_OPTIONS}
            value={groupBy}
            onChange={handleGroupBy}
            size="sm"
          />

          {/* Granularity — hidden for today/24h since those use hourly */}
          {period !== "today" && period !== "24h" && (
            <SegmentedControl
              options={INTERVAL_OPTIONS}
              value={granularity}
              onChange={handleInterval}
              size="sm"
            />
          )}

          {/* Refetching indicator */}
          {refetching && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              Updating…
            </span>
          )}
        </div>

        {/* API Key Filter */}
        {availableKeys.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted font-medium shrink-0">Filter keys:</span>
            {availableKeys.map((k) => {
              const active = apiKeyIds.includes(k.id);
              return (
                <button
                  key={k.id}
                  onClick={() => handleToggleKey(k.id)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
                    active
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-text-muted hover:text-text-main hover:border-text-muted"
                  }`}
                >
                  {k.name}
                </button>
              );
            })}
            {apiKeyIds.length > 0 && (
              <button
                onClick={handleClearKeys}
                className="text-xs text-text-muted hover:text-text-main transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Source warning */}
      {report?.range?.source === "dailySummary" && (period === "24h" || period === "today") && (
        <p className="text-xs text-text-muted px-1">
          ⚠ Hourly data unavailable for this range — showing daily aggregates.
        </p>
      )}

      {/* Metric Cards */}
      <ReportMetricCards totals={report?.totals} />

      {/* Charts */}
      <ReportTrendChart report={report} metric={metric} seriesBy={groupBy === "all" ? "none" : groupBy} groupBy={groupBy} />

      {/* Insights */}
      {report?.insights?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.insights.map((ins, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border bg-bg-subtle/50 text-text-muted"
            >
              <span className="material-symbols-outlined text-[14px]">
                {ins.type === "cost-driver" ? "trending_up" : ins.type === "cache-efficiency" ? "memory" : "insights"}
              </span>
              <span className="font-medium text-text-main">{ins.label}</span>
              {ins.text}
            </span>
          ))}
        </div>
      )}

      {/* Breakdown Table — hidden in "All" mode since there's no single grouping dimension */}
      {groupBy !== "all" && <ReportBreakdownTable breakdown={report?.breakdown} groupBy={groupBy} />}
    </div>
  );
}
