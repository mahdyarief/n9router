"use client";

import { useState } from "react";
import Button from "@/shared/components/Button";

const LIMIT_FIELDS = [
  { field: "inputTokens5h",  label: "Tokens / 5h",  placeholder: "e.g. 500000" },
  { field: "inputTokens24h", label: "Tokens / 24h", placeholder: "e.g. 2000000" },
  { field: "cost5h",         label: "Cost / 5h ($)", placeholder: "e.g. 1.00",  isCost: true },
  { field: "cost24h",        label: "Cost / 24h ($)", placeholder: "e.g. 5.00", isCost: true },
];

// Predefined duration options for custom windows
const PREDEFINED_DURATIONS = [
  { label: "15 minutes", ms: 15 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "12 hours", ms: 12 * 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

function UsageBar({ label, value, limit, isCost }) {
  if (!limit) return null;
  const pct = Math.min(100, (value / limit) * 100);
  const barCls = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary";
  const display = isCost
    ? `$${value.toFixed(4)} / $${limit.toFixed(2)} (${pct.toFixed(0)}%)`
    : `${value.toLocaleString()} / ${limit.toLocaleString()} (${pct.toFixed(0)}%)`;

  return (
    <>
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-muted">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

function formatDurationLabel(ms) {
  const minutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Inline panel rendered beneath a key row when editing limits.
 *
 * @param {object}   props.apiKey      - The API key object from the parent list
 * @param {object}   props.usageData   - keyUsage[key.id] response from /api/keys/:id/usage
 * @param {object}   props.limitDraft  - Current form values {inputTokens5h, …}
 * @param {Function} props.setLimitDraft
 * @param {boolean}  props.saving
 * @param {Function} props.onSave      - () => void
 * @param {Function} props.onCancel    - () => void
 */
export default function KeyLimitsEditor({
  apiKey,
  usageData,
  limitDraft,
  setLimitDraft,
  saving,
  onSave,
  onCancel,
}) {
  const u = usageData?.usage || {};
  const l = apiKey.limits;

  return (
    <div className="mb-3 rounded-lg border border-black/8 dark:border-white/8 bg-bg-subtle p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Usage Limits
        </span>
        <span className="text-xs text-text-muted">Leave blank = unlimited</span>
      </div>

      {/* Progress bars — only shown when limits are already saved */}
      {usageData && l && (
        <div className="mb-4 space-y-2">
          {/* Legacy 5h/24h bars */}
          {["5h", "24h"].map((win) => {
            const tokens = win === "5h" ? u.inputTokens5h || 0 : u.inputTokens24h || 0;
            const cost   = win === "5h" ? u.cost5h || 0       : u.cost24h || 0;
            const tLimit = win === "5h" ? l.inputTokens5h     : l.inputTokens24h;
            const cLimit = win === "5h" ? l.cost5h            : l.cost24h;
            const hasBars = tLimit || cLimit;
            if (!hasBars) return null;
            return (
              <div key={win} className="space-y-1">
                <UsageBar label={`${win} tokens`} value={tokens} limit={tLimit} />
                <UsageBar label={`${win} cost`}   value={cost}   limit={cLimit} isCost />
              </div>
            );
          })}
          {/* Custom window bars */}
          {l.windows && l.windows.map((win, idx) => {
            const tokenKey = `tokens_${win.durationMs}`;
            const costKey = `cost_${win.durationMs}`;
            const tokens = usageData.windowUsage?.[tokenKey] || 0;
            const cost = usageData.windowUsage?.[costKey] || 0;
            const hasBars = win.inputTokens || win.cost;
            if (!hasBars) return null;
            const label = win.label || formatDurationLabel(win.durationMs);
            return (
              <div key={`custom-${idx}`} className="space-y-1">
                <UsageBar label={`${label} tokens`} value={tokens} limit={win.inputTokens} />
                <UsageBar label={`${label} cost`} value={cost} limit={win.cost} isCost />
              </div>
            );
          })}
        </div>
      )}

      {/* 2 × 2 input grid for legacy limits */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {LIMIT_FIELDS.map(({ field, label, placeholder, isCost }) => (
          <div key={field}>
            <label className="block text-xs text-text-muted mb-1">{label}</label>
            <input
              type="number"
              min="0"
              step={isCost ? "0.01" : "1"}
              value={limitDraft[field] ?? ""}
              onChange={(e) =>
                setLimitDraft((prev) => ({ ...prev, [field]: e.target.value }))
              }
              placeholder={placeholder}
              className="w-full px-2 py-1.5 text-xs border border-black/10 dark:border-white/10 rounded-lg bg-bg text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        ))}
      </div>

      {/* Custom Windows Section */}
      <CustomWindowsEditor limitDraft={limitDraft} setLimitDraft={setLimitDraft} />

      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save limits"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Editor for custom time windows
 */
function CustomWindowsEditor({ limitDraft, setLimitDraft }) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(PREDEFINED_DURATIONS[1].ms); // Default 1 hour
  const windows = limitDraft.windows || [];

  const addWindow = () => {
    const duration = PREDEFINED_DURATIONS.find(d => d.ms === selectedDuration);
    if (!duration) return;

    // Check if window with this duration already exists
    if (windows.some(w => w.durationMs === selectedDuration)) {
      return;
    }

    const newWindow = {
      durationMs: selectedDuration,
      label: duration.label,
      inputTokens: "",
      cost: "",
    };

    setLimitDraft(prev => ({
      ...prev,
      windows: [...(prev.windows || []), newWindow]
    }));
    setShowAdd(false);
  };

  const removeWindow = (idx) => {
    setLimitDraft(prev => ({
      ...prev,
      windows: prev.windows.filter((_, i) => i !== idx)
    }));
  };

  const updateWindow = (idx, field, value) => {
    setLimitDraft(prev => ({
      ...prev,
      windows: prev.windows.map((w, i) => i === idx ? { ...w, [field]: value } : w)
    }));
  };

  // Get available durations (not already used)
  const usedDurations = new Set(windows.map(w => w.durationMs));
  const availableDurations = PREDEFINED_DURATIONS.filter(d => !usedDurations.has(d.ms));

  return (
    <div className="mb-4 border-t border-black/5 dark:border-white/5 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-muted">Custom Time Windows</span>
        {!showAdd && availableDurations.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Add window
          </button>
        )}
      </div>

      {/* List of existing windows */}
      {windows.length > 0 && (
        <div className="space-y-2 mb-3">
          {windows.map((win, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded bg-bg-secondary/50">
              <span className="text-xs font-medium w-20 shrink-0">{win.label || formatDurationLabel(win.durationMs)}</span>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={win.inputTokens ?? ""}
                  onChange={(e) => updateWindow(idx, "inputTokens", e.target.value)}
                  placeholder="Tokens"
                  className="w-full px-2 py-1 text-xs border border-black/10 dark:border-white/10 rounded bg-bg text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={win.cost ?? ""}
                  onChange={(e) => updateWindow(idx, "cost", e.target.value)}
                  placeholder="Cost $"
                  className="w-full px-2 py-1 text-xs border border-black/10 dark:border-white/10 rounded bg-bg text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <button
                onClick={() => removeWindow(idx)}
                className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                title="Remove window"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add window form */}
      {showAdd && availableDurations.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded bg-bg-secondary/50">
          <select
            value={selectedDuration}
            onChange={(e) => setSelectedDuration(Number(e.target.value))}
            className="flex-1 px-2 py-1 text-xs border border-black/10 dark:border-white/10 rounded bg-bg text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {availableDurations.map(d => (
              <option key={d.ms} value={d.ms}>{d.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={addWindow}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
        </div>
      )}

      {windows.length === 0 && !showAdd && (
        <p className="text-xs text-text-muted italic">No custom windows configured</p>
      )}
    </div>
  );
}
