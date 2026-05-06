"use client";

import Toggle from "@/shared/components/Toggle";
import KeyLimitsEditor from "./KeyLimitsEditor";

/** Mask an API key, showing only the last 4 chars. */
function maskKey(k) {
  return k ? `****${k.slice(-4)}` : "";
}

/**
 * Single row in the API Keys list, including the inline limits editor panel.
 *
 * Props passed straight from EndpointPageClient via spread or destructuring:
 *   apiKey            - key object {id, name, key, isActive, createdAt, limits?}
 *   visibleKeys       - Set<string>
 *   toggleKeyVisibility(keyId)
 *   copied            - id of currently-copied item (from useCopyToClipboard)
 *   copy(value, id)
 *   handleToggleKey(keyId, checked)
 *   handleDeleteKey(keyId)
 *   editingLimits     - id of key whose limits panel is open (or null)
 *   keyUsage          - {[keyId]: usageResponse}
 *   limitDraft        - {inputTokens5h, inputTokens24h, cost5h, cost24h}
 *   setLimitDraft
 *   savingLimits
 *   handleOpenLimits(key)
 *   handleSaveLimits(keyId)
 *   setEditingLimits
 */
export default function ApiKeyRow({
  apiKey: key,
  visibleKeys,
  toggleKeyVisibility,
  copied,
  copy,
  handleToggleKey,
  handleDeleteKey,
  editingLimits,
  keyUsage,
  limitDraft,
  setLimitDraft,
  savingLimits,
  handleOpenLimits,
  handleSaveLimits,
  setEditingLimits,
}) {
  const isVisible = visibleKeys.has(key.id);
  const inactive  = key.isActive === false;

  return (
    <div className="flex flex-col border-b border-black/5 dark:border-white/5 last:border-b-0">
      {/* Key row */}
      <div className={`group flex items-center justify-between py-3 ${inactive ? "opacity-60" : ""}`}>

        {/* Left: key info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{key.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-text-muted font-mono">
              {isVisible ? key.key : maskKey(key.key)}
            </code>
            <button
              onClick={() => toggleKeyVisibility(key.id)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
              title={isVisible ? "Hide key" : "Show key"}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isVisible ? "visibility_off" : "visibility"}
              </span>
            </button>
            <button
              onClick={() => copy(key.key, key.id)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">
                {copied === key.id ? "check" : "content_copy"}
              </span>
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Created {new Date(key.createdAt).toLocaleDateString()}
          </p>
          {inactive && <p className="text-xs text-orange-500 mt-1">Paused</p>}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Toggle
            size="sm"
            checked={key.isActive ?? true}
            onChange={(checked) => {
              if (key.isActive && !checked) {
                if (confirm(`Pause API key "${key.name}"?\n\nThis key will stop working immediately but can be resumed later.`)) {
                  handleToggleKey(key.id, checked);
                }
              } else {
                handleToggleKey(key.id, checked);
              }
            }}
            title={key.isActive ? "Pause key" : "Resume key"}
          />
          <button
            onClick={() => handleOpenLimits(key)}
            className={`p-2 rounded transition-all ${
              editingLimits === key.id
                ? "bg-primary/10 text-primary"
                : "hover:bg-black/5 dark:hover:bg-white/5 text-text-muted hover:text-primary opacity-0 group-hover:opacity-100"
            }`}
            title="Configure usage limits"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
          <button
            onClick={() => handleDeleteKey(key.id)}
            className="p-2 hover:bg-red-500/10 rounded text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      {/* Inline limits editor */}
      {editingLimits === key.id && (
        <KeyLimitsEditor
          apiKey={key}
          usageData={keyUsage[key.id]}
          limitDraft={limitDraft}
          setLimitDraft={setLimitDraft}
          saving={savingLimits}
          onSave={() => handleSaveLimits(key.id)}
          onCancel={() => setEditingLimits(null)}
        />
      )}
    </div>
  );
}
