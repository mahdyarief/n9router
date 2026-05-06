"use client";
import { useState } from "react";

/**
 * Encapsulates all state and handlers for per-key usage-limit editing.
 * Returns values to be spread into ApiKeyRow / KeyLimitsEditor.
 *
 * @param {Function} setKeys - setState setter from the parent component
 */
export function useKeyLimits(setKeys) {
  const [editingLimits, setEditingLimits] = useState(null);
  const [limitDraft, setLimitDraft] = useState({});
  const [keyUsage, setKeyUsage] = useState({});
  const [savingLimits, setSavingLimits] = useState(false);

  const fetchKeyUsage = async (keyId) => {
    try {
      const res = await fetch(`/api/keys/${keyId}/usage`);
      if (res.ok) {
        const data = await res.json();
        setKeyUsage((prev) => ({ ...prev, [keyId]: data }));
      }
    } catch {}
  };

  const handleOpenLimits = (key) => {
    if (editingLimits === key.id) {
      setEditingLimits(null);
      return;
    }
    const l = key.limits || {};
    setLimitDraft({
      inputTokens5h: l.inputTokens5h ? String(l.inputTokens5h) : "",
      inputTokens24h: l.inputTokens24h ? String(l.inputTokens24h) : "",
      cost5h: l.cost5h ? String(l.cost5h) : "",
      cost24h: l.cost24h ? String(l.cost24h) : "",
      windows: l.windows || [],
    });
    setEditingLimits(key.id);
    fetchKeyUsage(key.id);
  };

  const handleSaveLimits = async (keyId) => {
    setSavingLimits(true);
    try {
      const parse = (v, isFloat) => {
        if (!v) return null;
        const n = isFloat ? parseFloat(v) : Math.floor(parseFloat(v));
        return isNaN(n) || n <= 0 ? null : n;
      };
      const limits = {
        inputTokens5h: parse(limitDraft.inputTokens5h, false),
        inputTokens24h: parse(limitDraft.inputTokens24h, false),
        cost5h: parse(limitDraft.cost5h, true),
        cost24h: parse(limitDraft.cost24h, true),
      };

      // Include custom windows if any are defined
      if (limitDraft.windows && limitDraft.windows.length > 0) {
        limits.windows = limitDraft.windows
          .map((w) => ({
            durationMs: w.durationMs,
            label: w.label,
            inputTokens: parse(w.inputTokens, false),
            cost: parse(w.cost, true),
          }))
          .filter((w) => w.inputTokens || w.cost);
      }

      const res = await fetch(`/api/keys/${keyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limits }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys((prev) => prev.map((k) => (k.id === keyId ? data.key : k)));
        setEditingLimits(null);
        fetchKeyUsage(keyId);
      }
    } catch {}
    setSavingLimits(false);
  };

  return {
    editingLimits,
    setEditingLimits,
    limitDraft,
    setLimitDraft,
    keyUsage,
    savingLimits,
    handleOpenLimits,
    handleSaveLimits,
    fetchKeyUsage,
  };
}
