"use client";

/**
 * A small key icon that renders in table cells.
 * When apiKey is present, shows a clickable key icon with the full key as tooltip.
 * When absent, renders an em-dash placeholder.
 *
 * @param {string|null} props.apiKey  - Raw API key string or null/undefined
 */
export default function ApiKeyBadge({ apiKey }) {
  if (!apiKey) {
    return <span className="text-text-muted/30 text-[10px]">—</span>;
  }
  return (
    <span
      className="material-symbols-outlined text-[13px] text-text-muted cursor-help hover:text-primary transition-colors align-middle"
      title={apiKey}
    >
      key
    </span>
  );
}
