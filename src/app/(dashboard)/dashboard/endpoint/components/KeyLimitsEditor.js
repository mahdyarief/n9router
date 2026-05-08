"use client";

import { useState } from "react";
import Button from "@/shared/components/Button";
import Modal from "@/shared/components/Modal";

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

// Window options available in the reset modal
const RESET_WINDOW_OPTIONS = [
  { label: "All recorded time", windowMs: null },
  { label: "Last 5 hours",  windowMs: 5  * 60 * 60 * 1000 },
  { label: "Last 24 hours", windowMs: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days",   windowMs: 7  * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days",  windowMs: 30 * 24 * 60 * 60 * 1000 },
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
 * @param {object}   props.apiKey         - The API key object from the parent list
 * @param {object}   props.usageData      - keyUsage[key.id] response from /api/keys/:id/usage
 * @param {object}   props.limitDraft     - Current form values {inputTokens5h, …}
 * @param {Function} props.setLimitDraft
 * @param {boolean}  props.saving
 * @param {Function} props.onSave         - () => void
 * @param {Function} props.onCancel       - () => void
 * @param {Function} props.onResetUsage   - (windowMs, windowLabel) => void
 * @param {Array}    props.resetHistory   - Array of reset history entries for this key
 * @param {boolean}  props.resettingUsage - Whether a reset is in progress
 */
export default function KeyLimitsEditor({
  apiKey,
  usageData,
  limitDraft,
  setLimitDraft,
  saving,
  onSave,
  onCancel,
  onResetUsage,
  resetHistory,
  resettingUsage,
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
        {onResetUsage && (
          <ResetUsageSection
            keyName={apiKey.name}
            onResetUsage={onResetUsage}
            resettingUsage={resettingUsage}
          />
        )}
      </div>

      {/* Reset History */}
      {resetHistory && resetHistory.length > 0 && (
        <ResetHistorySection history={resetHistory} />
      )}
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

/**
 * Reset button + confirm modal for clearing usage within a chosen time window.
 */
function ResetUsageSection({ keyName, onResetUsage, resettingUsage }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState(RESET_WINDOW_OPTIONS[0]);

  const handleConfirm = async () => {
    await onResetUsage(selectedWindow.windowMs, selectedWindow.label);
    setShowModal(false);
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowModal(true)}
        disabled={resettingUsage}
        className="ml-auto text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 border-amber-500/30"
      >
        <span className="material-symbols-outlined text-[14px] mr-1">restart_alt</span>
        Reset usage
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => !resettingUsage && setShowModal(false)}
        title="Reset Usage"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)} disabled={resettingUsage}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirm}
              loading={resettingUsage}
            >
              Reset
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Clear usage counters for <strong className="text-text-main">{keyName}</strong>.
            This deletes the underlying request records for the selected window — limits will
            read zero until new requests come in.
          </p>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">
              Time window to clear
            </label>
            <div className="flex flex-col gap-1">
              {RESET_WINDOW_OPTIONS.map((opt) => (
                <label
                  key={opt.label}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                    selectedWindow.label === opt.label
                      ? "border-primary/40 bg-primary/5 text-text-main"
                      : "border-transparent hover:bg-black/5 dark:hover:bg-white/5 text-text-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="reset-window"
                    className="accent-primary"
                    checked={selectedWindow.label === opt.label}
                    onChange={() => setSelectedWindow(opt)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-700 dark:text-amber-400">
            <span className="material-symbols-outlined text-[15px] mt-px shrink-0">warning</span>
            <p className="text-xs">
              This action cannot be undone. The deleted records will be logged in reset history.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Collapsible reset history list shown at the bottom of the limits editor.
 */
function ResetHistorySection({ history }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? history : history.slice(0, 3);

  return (
    <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-main transition-colors mb-2"
      >
        <span className="material-symbols-outlined text-[14px]">history</span>
        Reset history ({history.length})
        <span className="material-symbols-outlined text-[12px] ml-auto">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      <div className="space-y-1">
          {shown.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-black/3 dark:bg-white/3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[12px] text-amber-500 shrink-0">restart_alt</span>
                <span className="text-text-muted truncate">{entry.window_label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                {entry.tokens_cleared > 0 && (
                  <span className="text-text-muted font-mono">
                    {entry.tokens_cleared >= 1000
                      ? `${(entry.tokens_cleared / 1000).toFixed(0)}k`
                      : entry.tokens_cleared} tok
                  </span>
                )}
                {entry.cost_cleared > 0 && (
                  <span className="text-text-muted font-mono">${entry.cost_cleared.toFixed(4)}</span>
                )}
                <span className="text-text-muted/60">
                  {new Date(entry.reset_at).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
          {!expanded && history.length > 3 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-primary hover:underline mt-1"
            >
              Show {history.length - 3} more…
            </button>
          )}
      </div>
    </div>
  );
}
