"use client";

import Button from "@/shared/components/Button";

const LIMIT_FIELDS = [
  { field: "inputTokens5h",  label: "Tokens / 5h",  placeholder: "e.g. 500000" },
  { field: "inputTokens24h", label: "Tokens / 24h", placeholder: "e.g. 2000000" },
  { field: "cost5h",         label: "Cost / 5h ($)", placeholder: "e.g. 1.00",  isCost: true },
  { field: "cost24h",        label: "Cost / 24h ($)", placeholder: "e.g. 5.00", isCost: true },
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
        </div>
      )}

      {/* 2 × 2 input grid */}
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
