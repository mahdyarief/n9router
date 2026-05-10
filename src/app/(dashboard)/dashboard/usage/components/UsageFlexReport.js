"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toPng } from "html-to-image";
import { CardSkeleton, Button, Card } from "@/shared/components";
import SegmentedControl from "@/shared/components/SegmentedControl";
import UsageFlexCard from "./UsageFlexCard";
import {
  FLEX_PERIOD_OPTIONS,
  FLEX_TYPE_OPTIONS,
  FLEX_STYLE_OPTIONS,
  autoSelectFlexType,
  getThemeConfig,
  generateCaption,
  getSurpriseCombo,
} from "./usageFlexPresets";

// ─── Data helpers ─────────────────────────────────────────────────────────────

function buildFlexParams(period) {
  const params = new URLSearchParams({
    metric: "tokens",
    groupBy: "apiKey",
    seriesBy: "none",
  });

  if (period === "today") {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    params.set("period", "custom");
    params.set("startDate", midnight.toISOString());
    params.set("endDate", now.toISOString());
    params.set("interval", "hour");
  } else {
    params.set("period", period);
  }

  return params.toString();
}

function deriveFlexData(report, period) {
  if (!report?.totals) return null;
  return {
    period,
    totals: {
      requests: report.totals.requests ?? 0,
      totalTokens: report.totals.totalTokens ?? 0,
      promptTokens: report.totals.promptTokens ?? 0,
      completionTokens: report.totals.completionTokens ?? 0,
      cachedTokens: report.totals.cachedTokens ?? 0,
      cost: report.totals.cost ?? 0,
      avgCostPerRequest: report.totals.avgCostPerRequest ?? 0,
      cacheHitRatio: report.totals.cacheHitRatio ?? 0,
    },
    highlights: {
      topModel: report.top?.models?.[0]?.label ?? null,
      topModelPct: report.top?.models?.[0]?.percentage ?? 0,
      topProvider: report.top?.providers?.[0]?.label ?? null,
      topProviderPct: report.top?.providers?.[0]?.percentage ?? 0,
      uniqueModels: report.top?.models?.length ?? 0,
      uniqueProviders: report.top?.providers?.length ?? 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UsageFlexReport() {
  // Controls
  const [period, setPeriod] = useState("30d");
  const [flexType, setFlexType] = useState("auto");
  const [style, setStyle] = useState("auto");
  const [collapsed, setCollapsed] = useState(false);

  // Data
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Export / copy state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Preview scaling
  const previewContainerRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(0.37);

  // Export card ref (unscaled 1080×1080)
  const cardRef = useRef(null);
  const abortRef = useRef(null);

  // ── Derived values ────────────────────────────────────────────────────────

  const flexData = report ? deriveFlexData(report, period) : null;
  const resolvedFlexType =
    flexType === "auto" ? autoSelectFlexType(flexData) : flexType;
  const themeConfig = getThemeConfig(style, resolvedFlexType);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFlex = useCallback(async (p) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const qs = buildFlexParams(p);
      const res = await fetch(`/api/usage/report?${qs}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      setReport(await res.json());
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlex(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Preview scaling ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!previewContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setPreviewScale(w / 1080);
      }
    });
    observer.observe(previewContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const dataUrl = await toPng(cardRef.current, {
        width: 1080,
        height: 1080,
        pixelRatio: 2,
        cacheBust: true,
        // Skip cross-origin CSS/font inlining (Google Fonts, Material Symbols).
        // Card uses purely inline styles + system fonts — no external fonts needed.
        skipFonts: true,
      });
      const link = document.createElement("a");
      link.download = `9router-flex-${period}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("[FlexReport] Export failed:", err);
      setExportError(true);
      setTimeout(() => setExportError(false), 3000);
    } finally {
      setExporting(false);
    }
  }, [cardRef, exporting, period]);

  const handleCopyCaption = useCallback(async () => {
    if (!flexData) return;
    const caption = generateCaption(resolvedFlexType, flexData, period);
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement("textarea");
      ta.value = caption;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch { /* silent */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [flexData, resolvedFlexType, period]);

  const handleSurprise = useCallback(() => {
    const { flexType: newType, style: newStyle } = getSurpriseCombo(
      resolvedFlexType,
      style === "auto" ? getThemeConfig("auto", resolvedFlexType).__resolved : style
    );
    setFlexType(newType);
    setStyle(newStyle);
  }, [resolvedFlexType, style]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasData = Boolean(flexData);
  const noData = !loading && !error && flexData && (
    (flexData.totals.requests === 0) && (flexData.totals.totalTokens === 0)
  );

  return (
    <Card className="overflow-hidden">
      {/* Header — clickable to collapse */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-bg-subtle/50 hover:bg-bg-subtle/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
          <h3 className="text-sm font-semibold text-text-main">Usage Flex</h3>
          <span className="text-xs text-text-muted">Share your AI stats</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Surprise Me — only shown when expanded */}
          {!collapsed && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); handleSurprise(); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-muted hover:text-text-main hover:border-text-muted transition-colors ${loading ? "opacity-40 pointer-events-none" : ""}`}
            >
              <span className="material-symbols-outlined text-[14px]">shuffle</span>
              Surprise Me
            </span>
          )}
          {/* Chevron */}
          <span
            className="material-symbols-outlined text-[18px] text-text-muted transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            expand_more
          </span>
        </div>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
            {/* Period */}
            <SegmentedControl
              options={FLEX_PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
            />

            {/* Flex type */}
            <SegmentedControl
              options={FLEX_TYPE_OPTIONS}
              value={flexType}
              onChange={setFlexType}
              size="sm"
            />

            {/* Style */}
            <SegmentedControl
              options={FLEX_STYLE_OPTIONS}
              value={style}
              onChange={setStyle}
              size="sm"
            />
          </div>

          {/* Preview area */}
          <div className="p-4">
            {loading ? (
              <div className="flex flex-col gap-3">
                <CardSkeleton className="w-full aspect-square max-w-xs mx-auto h-auto" style={{ aspectRatio: "1" }} />
              </div>
            ) : error ? (
              <Card className="flex flex-col items-center gap-3 p-8 text-center max-w-xs mx-auto">
                <span className="material-symbols-outlined text-3xl text-text-muted">error</span>
                <p className="text-text-muted text-sm">{error}</p>
                <Button size="sm" icon="refresh" onClick={() => fetchFlex(period)}>
                  Retry
                </Button>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Scaled preview */}
                <div className="flex justify-center">
                  <div
                    ref={previewContainerRef}
                    className="relative w-full"
                    style={{ maxWidth: 400, aspectRatio: "1", overflow: "hidden" }}
                  >
                    <div
                      style={{
                        width: 1080,
                        height: 1080,
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top left",
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                    >
                      <UsageFlexCard
                        ref={cardRef}
                        flexData={flexData}
                        flexType={resolvedFlexType}
                        themeConfig={themeConfig}
                        period={period}
                      />
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {/* Download PNG */}
                  <button
                    onClick={handleDownload}
                    disabled={exporting || !hasData || noData}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
                      ${exportError
                        ? "bg-red-500/10 border border-red-500/30 text-red-500"
                        : "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {exporting ? "progress_activity" : exportError ? "error" : "download"}
                    </span>
                    {exporting ? "Exporting…" : exportError ? "Export Failed" : "Download PNG"}
                  </button>

                  {/* Copy Caption */}
                  <button
                    onClick={handleCopyCaption}
                    disabled={!hasData || noData}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
                      ${copied
                        ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
                        : "border border-border text-text-muted hover:text-text-main hover:border-text-muted"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <span className={`material-symbols-outlined text-[16px] ${exporting ? "animate-spin" : ""}`}>
                      {copied ? "check_circle" : "content_copy"}
                    </span>
                    {copied ? "Copied!" : "Copy Caption"}
                  </button>

                  {/* Refresh */}
                  <button
                    onClick={() => fetchFlex(period)}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-main border border-transparent hover:border-border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Refresh data"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                  </button>
                </div>

                {noData && (
                  <p className="text-center text-xs text-text-muted">
                    No usage data for this period yet — start routing requests to see your flex!
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
