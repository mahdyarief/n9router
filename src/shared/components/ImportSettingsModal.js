"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";
import { cn } from "@/shared/utils/cn";

const SECTIONS = [
  {
    key: "providerConnections",
    label: "Connections",
    description: "Provider connection credentials",
    type: "array",
    supportsMerge: true,
  },
  {
    key: "providerNodes",
    label: "Providers",
    description: "Provider node configurations",
    type: "array",
    supportsMerge: true,
  },
  {
    key: "settings",
    label: "Settings",
    description: "App settings (routing, security, network, etc.)",
    type: "object",
    supportsMerge: false,
  },
  {
    key: "combos",
    label: "Combos",
    description: "Model combo sequences",
    type: "array",
    supportsMerge: false,
  },
  {
    key: "apiKeys",
    label: "API Keys",
    description: "Gateway API keys",
    type: "array",
    supportsMerge: false,
  },
  {
    key: "modelAliases",
    label: "Model Aliases",
    description: "Custom model name mappings",
    type: "object",
    supportsMerge: false,
  },
  {
    key: "customModels",
    label: "Custom Models",
    description: "User-defined model entries",
    type: "array",
    supportsMerge: false,
  },
  {
    key: "proxyPools",
    label: "Proxy Pools",
    description: "Proxy pool configurations",
    type: "array",
    supportsMerge: false,
  },
  {
    key: "pricing",
    label: "Pricing",
    description: "Custom model pricing overrides",
    type: "object",
    supportsMerge: false,
  },
  {
    key: "mitmAlias",
    label: "MITM Aliases",
    description: "MITM proxy model aliases",
    type: "object",
    supportsMerge: false,
  },
];

function sectionCount(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  return 0;
}

function sectionHasData(payload, key) {
  return sectionCount(payload?.[key]) > 0;
}

function buildDefaultModes(payload) {
  const modes = {};
  for (const section of SECTIONS) {
    const present = sectionHasData(payload, section.key);
    // Overwrite is destructive (replaces current data), so it's never the default —
    // non-mergeable sections must be opted into explicitly.
    modes[section.key] = present && section.supportsMerge ? "merge" : "skip";
  }
  return modes;
}

/**
 * Compute the impact of importing a section given the current data and chosen mode.
 * Returns null when there is nothing to apply (skip or no current data loaded yet).
 */
function computeImpact(section, payload, current, mode) {
  if (mode === "skip") return null;
  if (!current) return null;

  const imported = payload?.[section.key];
  const existing = current?.[section.key];

  if (section.type === "array") {
    const importedArr = Array.isArray(imported) ? imported : [];
    const existingArr = Array.isArray(existing) ? existing : [];

    if (mode === "merge") {
      const existingIds = new Set(existingArr.map((i) => i?.id));
      const importedIds = new Set(importedArr.map((i) => i?.id));
      let added = 0;
      let updated = 0;
      for (const item of importedArr) {
        if (item?.id != null && existingIds.has(item.id)) updated++;
        else added++;
      }
      // Id-less existing items can't be matched, so they are always kept on merge.
      const kept = existingArr.filter((i) => i?.id == null || !importedIds.has(i.id)).length;
      return { mode, added, updated, kept, resultTotal: existingArr.length + added };
    }

    // overwrite — the whole array is replaced with the imported one
    const existingIds = new Set(existingArr.map((i) => i?.id));
    const importedIds = new Set(importedArr.map((i) => i?.id));
    let added = 0;
    let updated = 0; // same id already existed → overwritten
    for (const item of importedArr) {
      if (item?.id != null && existingIds.has(item.id)) updated++;
      else added++;
    }
    // On overwrite, id-less existing items are removed too — the array is fully replaced.
    const removed = existingArr.filter((i) => i?.id == null || !importedIds.has(i.id)).length;
    return { mode: "overwrite", added, updated, removed, resultTotal: importedArr.length };
  }

  // object (overwrite/skip only) — top-level key comparison
  const importedObj = imported && typeof imported === "object" && !Array.isArray(imported) ? imported : {};
  const existingObj = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const importedKeys = Object.keys(importedObj);
  let added = 0;
  let updated = 0;
  for (const k of importedKeys) {
    if (Object.prototype.hasOwnProperty.call(existingObj, k)) updated++;
    else added++;
  }
  // For settings, missing keys reset to defaults (not truly removed), so omit the removed count.
  const removed =
    section.key === "settings"
      ? 0
      : Object.keys(existingObj).filter(
          (k) => !Object.prototype.hasOwnProperty.call(importedObj, k)
        ).length;
  return { mode: "overwrite", added, updated, removed, resultTotal: importedKeys.length };
}

function getItemLabel(item) {
  if (item == null) return "(unknown)";
  if (typeof item !== "object") return String(item);
  return (
    item.name ||
    item.displayName ||
    item.email ||
    item.alias ||
    item.model ||
    item.id ||
    "(unnamed)"
  );
}

const DETAIL_GROUP_STYLES = {
  new: "text-green-600 dark:text-green-400",
  added: "text-green-600 dark:text-green-400",
  updated: "text-blue-600 dark:text-blue-400",
  overwritten: "text-amber-600 dark:text-amber-400",
  kept: "text-text-muted",
  removed: "text-red-600 dark:text-red-400",
};

const DETAIL_TAG_STYLES = {
  new: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
  added: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300",
  updated: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
  overwritten: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
  kept: "bg-surface-2 border-border text-text-secondary",
  removed: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 line-through",
};

/**
 * Build the per-item breakdown (labels grouped by change type) for the expanded view.
 */
function computeItemDetails(section, payload, current, mode) {
  if (mode === "skip" || !current) return null;

  const imported = payload?.[section.key];
  const existing = current?.[section.key];

  if (section.type === "array") {
    const importedArr = Array.isArray(imported) ? imported : [];
    const existingArr = Array.isArray(existing) ? existing : [];
    const existingIds = new Set(existingArr.map((i) => i?.id));
    const importedIds = new Set(importedArr.map((i) => i?.id));

    const fresh = [];
    const matched = [];
    for (const item of importedArr) {
      if (item?.id != null && existingIds.has(item.id)) matched.push(getItemLabel(item));
      else fresh.push(getItemLabel(item));
    }
    // Id-less existing items can't be matched: kept on merge, removed on overwrite.
    const others = existingArr
      .filter((i) => i?.id == null || !importedIds.has(i.id))
      .map(getItemLabel);

    if (mode === "merge") {
      return [
        { key: "new", label: "New", items: fresh },
        { key: "updated", label: "Updated", items: matched },
        { key: "kept", label: "Kept", items: others },
      ];
    }
    return [
      { key: "added", label: "Added", items: fresh },
      { key: "overwritten", label: "Overwritten", items: matched },
      { key: "removed", label: "Removed", items: others },
    ];
  }

  const importedObj = imported && typeof imported === "object" && !Array.isArray(imported) ? imported : {};
  const existingObj = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const importedKeys = Object.keys(importedObj);
  const added = importedKeys.filter((k) => !Object.prototype.hasOwnProperty.call(existingObj, k));
  const updated = importedKeys.filter((k) => Object.prototype.hasOwnProperty.call(existingObj, k));
  const removed =
    section.key === "settings"
      ? []
      : Object.keys(existingObj).filter((k) => !Object.prototype.hasOwnProperty.call(importedObj, k));
  return [
    { key: "added", label: "Added", items: added },
    { key: "updated", label: section.key === "settings" ? "Changed" : "Updated", items: updated },
    { key: "removed", label: "Removed", items: removed },
  ];
}

function DetailList({ groups }) {
  const nonEmpty = (groups || []).filter((g) => g.items.length > 0);
  if (!nonEmpty.length) {
    return <p className="text-xs text-text-muted italic">No items affected.</p>;
  }
  return (
    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
      {nonEmpty.map((g) => (
        <div key={g.key}>
          <p className={cn("text-xs font-semibold", DETAIL_GROUP_STYLES[g.key])}>
            {g.label} ({g.items.length})
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {g.items.map((label, i) => (
              <span
                key={i}
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full border truncate max-w-[200px]",
                  DETAIL_TAG_STYLES[g.key] || "bg-surface-2 border-border text-text-secondary"
                )}
                title={label}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImpactSummary({ impact, loading }) {
  if (loading) {
    return <span className="text-xs text-text-muted italic">Calculating impact…</span>;
  }
  if (!impact) return null;

  const chips = [];
  if (impact.mode === "merge") {
    chips.push({ label: `+${impact.added} new`, cls: "text-green-600 dark:text-green-400" });
    chips.push({ label: `${impact.updated} updated`, cls: "text-blue-600 dark:text-blue-400" });
    chips.push({ label: `${impact.kept} kept`, cls: "text-text-muted" });
  } else {
    // overwrite
    if (impact.added !== undefined) {
      chips.push({ label: `${impact.added} added`, cls: "text-green-600 dark:text-green-400" });
    }
    if (impact.updated !== undefined && impact.updated > 0) {
      chips.push({ label: `${impact.updated} overwritten`, cls: "text-amber-600 dark:text-amber-400" });
    }
    if (impact.removed !== undefined && impact.removed > 0) {
      chips.push({ label: `${impact.removed} removed`, cls: "text-red-600 dark:text-red-400" });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
      {chips.map((chip, i) => (
        <span key={i} className={cn("text-xs font-medium", chip.cls)}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

const MODE_STYLES = {
  merge: "text-blue-600 dark:text-blue-400 border-blue-500 bg-blue-500/10",
  overwrite: "text-amber-600 dark:text-amber-400 border-amber-500 bg-amber-500/10",
  skip: "text-text-muted border-border hover:bg-surface-2",
};

function ModeSelector({ value, onChange, supportsMerge, disabled }) {
  const options = supportsMerge ? ["merge", "overwrite", "skip"] : ["overwrite", "skip"];
  const labels = { merge: "Merge", overwrite: "Overwrite", skip: "Skip" };

  return (
    <div className={cn("flex gap-1 shrink-0", disabled && "opacity-40 pointer-events-none")}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
            value === opt ? MODE_STYLES[opt] : "text-text-muted border-border hover:bg-surface-2"
          )}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

export default function ImportSettingsModal({ isOpen, onClose, onConfirm, payload, loading }) {
  // State resets on each mount — parent passes a new key whenever payload changes.
  const [modes, setModes] = useState(() => buildDefaultModes(payload));
  const [currentData, setCurrentData] = useState(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [expandedKey, setExpandedKey] = useState(null);

  // Fetch the current database so we can preview the import impact before applying.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/database")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setCurrentData(data);
      })
      .catch(() => {
        if (!cancelled) setCurrentData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingCurrent(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = (key, mode) => setModes((prev) => ({ ...prev, [key]: mode }));

  const activeCount = Object.values(modes).filter((m) => m !== "skip").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Settings"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(modes)}
            loading={loading}
            disabled={activeCount === 0}
          >
            {activeCount > 0 ? `Import (${activeCount} section${activeCount !== 1 ? "s" : ""})` : "Import"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">
          Choose how each section from the backup file should be applied. The impact preview shows
          what will change in your current settings before you import.
        </p>

        <div className="flex flex-col gap-2">
          {SECTIONS.map((section) => {
            const present = sectionHasData(payload, section.key);
            const fileCount = sectionCount(payload?.[section.key]);
            const mode = modes[section.key] || "skip";
            const impact = present ? computeImpact(section, payload, currentData, mode) : null;
            const expandable = present && mode !== "skip" && !loadingCurrent && !!currentData;
            const isExpanded = expandedKey === section.key && expandable;
            const details = isExpanded ? computeItemDetails(section, payload, currentData, mode) : null;
            return (
              <div
                key={section.key}
                className={cn(
                  "rounded-lg border",
                  present ? "border-border bg-surface-2/50" : "border-border/50 opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3 p-3">
                  <div
                    className={cn("flex-1 min-w-0", expandable && "cursor-pointer")}
                    onClick={() => expandable && setExpandedKey(isExpanded ? null : section.key)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{section.label}</p>
                      {present ? (
                        <span className="text-xs text-text-muted">
                          ({fileCount} in file)
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted italic">(not in file)</span>
                      )}
                      {expandable && (
                        <span className="material-symbols-outlined text-[16px] text-text-muted">
                          {isExpanded ? "expand_less" : "expand_more"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{section.description}</p>
                    {present && mode !== "skip" && (
                      <ImpactSummary impact={impact} loading={loadingCurrent} />
                    )}
                  </div>
                  <ModeSelector
                    value={mode}
                    onChange={(m) => setMode(section.key, m)}
                    supportsMerge={section.supportsMerge}
                    disabled={!present}
                  />
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/50">
                    <DetailList groups={details} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>
            <span className="font-semibold text-blue-500">Merge</span> — add new + update matching, keep the rest
          </span>
          <span>
            <span className="font-semibold text-amber-500">Overwrite</span> — replace entirely with file data
          </span>
          <span>
            <span className="font-semibold">Skip</span> — keep current, ignore file data
          </span>
        </div>
      </div>
    </Modal>
  );
}
