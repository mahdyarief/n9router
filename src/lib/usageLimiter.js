/**
 * API Key Usage Limiter
 *
 * SQLite-backed rolling window tracker for per-API-key usage limits.
 * Uses better-sqlite3 (already in project) for fast synchronous persistence.
 *
 * Architecture:
 * - SQLite stores every usage entry (input_tokens, cost, ts)
 * - In-memory totals cache enables O(1) pre-request checks
 * - Background recalc every 60s self-heals the cache
 * - Instant startup — one SELECT SUM() GROUP BY rebuilds totals in ~1ms
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "@/lib/dataDir.js";

const DB_PATH = path.join(DATA_DIR, "usage-limits.db");
const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const RECALC_INTERVAL_MS = 60 * 1000; // self-healing every 60s
const LIMITS_CACHE_TTL_MS = 5000; // re-read key limits from DB every 5s

// ─── SQLite Instance (global singleton) ─────────────────────
if (!global._usageLimiterDb) {
  global._usageLimiterDb = null;
}
if (!global._usageLimiterStmts) {
  global._usageLimiterStmts = null;
}

function getDb() {
  if (global._usageLimiterDb) return global._usageLimiterDb;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL"); // concurrent reads while writing
  db.pragma("synchronous = NORMAL"); // balanced durability/perf

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_key_ts ON usage_entries(api_key, ts);
  `);

  global._usageLimiterDb = db;
  return db;
}

function getStmts() {
  if (global._usageLimiterStmts) return global._usageLimiterStmts;
  const db = getDb();

  global._usageLimiterStmts = {
    insert: db.prepare(
      "INSERT INTO usage_entries (api_key, input_tokens, cost, ts) VALUES (?, ?, ?, ?)"
    ),
    sumByKey: db.prepare(`
      SELECT
        SUM(CASE WHEN ts >= ? THEN input_tokens ELSE 0 END) AS inputTokens5h,
        SUM(input_tokens) AS inputTokens24h,
        SUM(CASE WHEN ts >= ? THEN cost ELSE 0 END) AS cost5h,
        SUM(cost) AS cost24h
      FROM usage_entries
      WHERE api_key = ? AND ts >= ?
    `),
    sumAllKeys: db.prepare(`
      SELECT
        api_key,
        SUM(CASE WHEN ts >= ? THEN input_tokens ELSE 0 END) AS inputTokens5h,
        SUM(input_tokens) AS inputTokens24h,
        SUM(CASE WHEN ts >= ? THEN cost ELSE 0 END) AS cost5h,
        SUM(cost) AS cost24h
      FROM usage_entries
      WHERE ts >= ?
      GROUP BY api_key
    `),
    prune: db.prepare("DELETE FROM usage_entries WHERE ts < ?"),
  };

  return global._usageLimiterStmts;
}

// ─── In-Memory Totals Cache ──────────────────────────────────
// { [apiKeyValue]: { inputTokens5h, inputTokens24h, cost5h, cost24h } }
if (!global._usageLimiterTotals) {
  global._usageLimiterTotals = {};
}
const totalsCache = global._usageLimiterTotals;

// Per-key limits cache (from localDb, refreshed every 5s)
if (!global._usageLimiterLimits) {
  global._usageLimiterLimits = { data: {}, ts: 0 };
}
const limitsCache = global._usageLimiterLimits;

// Background recalc timer
if (!global._usageLimiterTimer) {
  global._usageLimiterTimer = null;
}

// ─── Limits Cache ────────────────────────────────────────────

async function refreshLimitsCache() {
  if (Date.now() - limitsCache.ts < LIMITS_CACHE_TTL_MS) return;
  try {
    const { getApiKeys } = await import("@/lib/localDb.js");
    const allKeys = await getApiKeys();
    const newData = {};
    for (const k of allKeys) {
      if (k.limits) newData[k.key] = k.limits;
    }
    limitsCache.data = newData;
    limitsCache.ts = Date.now();
  } catch (err) {
    console.error("[usageLimiter] Failed to refresh limits cache:", err.message);
  }
}

// ─── Rolling Sums ────────────────────────────────────────────

function recalcKey(apiKeyValue) {
  const now = Date.now();
  const cutoff5h = now - WINDOW_5H_MS;
  const cutoff24h = now - WINDOW_24H_MS;

  try {
    const row = getStmts().sumByKey.get(cutoff5h, cutoff5h, apiKeyValue, cutoff24h);
    totalsCache[apiKeyValue] = {
      inputTokens5h: row?.inputTokens5h || 0,
      inputTokens24h: row?.inputTokens24h || 0,
      cost5h: row?.cost5h || 0,
      cost24h: row?.cost24h || 0,
    };
  } catch (err) {
    console.error("[usageLimiter] recalcKey failed:", err.message);
    totalsCache[apiKeyValue] = { inputTokens5h: 0, inputTokens24h: 0, cost5h: 0, cost24h: 0 };
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Check if apiKey is within its configured limits.
 * O(1) in-memory check after first access.
 * @param {string|null} apiKeyValue
 * @returns {Promise<{allowed: true}|{allowed: false, reason: string, limitType: string, usage: object}>}
 */
export async function checkLimit(apiKeyValue) {
  if (!apiKeyValue) return { allowed: true };

  // Start background recalc if not running
  if (!global._usageLimiterTimer) {
    startBackgroundRecalc();
  }

  await refreshLimitsCache();
  const limits = limitsCache.data[apiKeyValue];
  if (!limits) return { allowed: true }; // No limits configured for this key

  // Ensure totals initialized (first request for this key since startup)
  if (!totalsCache[apiKeyValue]) {
    recalcKey(apiKeyValue);
  }

  const sums = totalsCache[apiKeyValue] || { inputTokens5h: 0, inputTokens24h: 0, cost5h: 0, cost24h: 0 };

  const checks = [
    {
      field: "inputTokens5h",
      label: "5h input token",
      fmt: (v) => v.toLocaleString() + " tokens",
    },
    {
      field: "inputTokens24h",
      label: "24h input token",
      fmt: (v) => v.toLocaleString() + " tokens",
    },
    {
      field: "cost5h",
      label: "5h cost",
      fmt: (v) => "$" + v.toFixed(4),
    },
    {
      field: "cost24h",
      label: "24h cost",
      fmt: (v) => "$" + v.toFixed(4),
    },
  ];

  for (const { field, label, fmt } of checks) {
    const limit = limits[field];
    if (limit && sums[field] >= limit) {
      // Get the key name for a friendlier error message
      let keyName = apiKeyValue.slice(0, 8) + "...";
      try {
        const { getApiKeys } = await import("@/lib/localDb.js");
        const allKeys = await getApiKeys();
        const k = allKeys.find((k) => k.key === apiKeyValue);
        if (k) keyName = k.name;
      } catch {
        // keep default masked key name
      }

      return {
        allowed: false,
        reason: `API key "${keyName}" exceeded ${label} limit (${fmt(sums[field])} / ${fmt(limit)})`,
        limitType: field,
        usage: { ...sums },
      };
    }
  }

  return { allowed: true, usage: { ...sums } };
}

/**
 * Record usage after a request completes.
 * Synchronous SQLite INSERT + increment in-memory totals.
 * @param {string} apiKeyValue
 * @param {number} inputTokens
 * @param {number} cost
 */
export function recordUsage(apiKeyValue, inputTokens, cost) {
  if (!apiKeyValue || typeof apiKeyValue !== "string") return;

  const ts = Date.now();
  try {
    getStmts().insert.run(apiKeyValue, inputTokens || 0, cost || 0, ts);
  } catch (err) {
    console.error("[usageLimiter] INSERT failed:", err.message);
    return;
  }

  // Increment in-memory totals (avoids recalc on every request)
  if (!totalsCache[apiKeyValue]) {
    totalsCache[apiKeyValue] = { inputTokens5h: 0, inputTokens24h: 0, cost5h: 0, cost24h: 0 };
  }
  const t = totalsCache[apiKeyValue];
  const tokens = inputTokens || 0;
  const c = cost || 0;
  t.inputTokens5h += tokens;
  t.inputTokens24h += tokens;
  t.cost5h += c;
  t.cost24h += c;
}

/**
 * Get usage summary for a key — reads fresh from SQLite (for dashboard accuracy).
 * @param {string} apiKeyValue
 * @returns {Promise<{usage: object, limits: object}>}
 */
export async function getUsageSummary(apiKeyValue) {
  const now = Date.now();
  const cutoff5h = now - WINDOW_5H_MS;
  const cutoff24h = now - WINDOW_24H_MS;

  let usage = { inputTokens5h: 0, inputTokens24h: 0, cost5h: 0, cost24h: 0 };
  try {
    const row = getStmts().sumByKey.get(cutoff5h, cutoff5h, apiKeyValue, cutoff24h);
    usage = {
      inputTokens5h: row?.inputTokens5h || 0,
      inputTokens24h: row?.inputTokens24h || 0,
      cost5h: row?.cost5h || 0,
      cost24h: row?.cost24h || 0,
    };
  } catch (err) {
    console.error("[usageLimiter] getUsageSummary failed:", err.message);
  }

  await refreshLimitsCache();
  const limits = limitsCache.data[apiKeyValue] || {};

  return { usage, limits };
}

// ─── Background Recalc & Prune ───────────────────────────────

function backgroundRecalcAndPrune() {
  try {
    const now = Date.now();
    const cutoff5h = now - WINDOW_5H_MS;
    const cutoff24h = now - WINDOW_24H_MS;

    // Prune entries older than 24h
    getStmts().prune.run(cutoff24h);

    // Recalc all active keys from SQLite
    const rows = getStmts().sumAllKeys.all(cutoff5h, cutoff5h, cutoff24h);

    const newTotals = {};
    for (const row of rows) {
      newTotals[row.api_key] = {
        inputTokens5h: row.inputTokens5h || 0,
        inputTokens24h: row.inputTokens24h || 0,
        cost5h: row.cost5h || 0,
        cost24h: row.cost24h || 0,
      };
    }

    // Sync cache — remove stale keys, add/update active ones
    for (const key of Object.keys(totalsCache)) {
      if (!newTotals[key]) delete totalsCache[key];
    }
    Object.assign(totalsCache, newTotals);
  } catch (err) {
    console.error("[usageLimiter] Background recalc failed:", err.message);
  }
}

export function startBackgroundRecalc() {
  if (global._usageLimiterTimer) return;

  // Initial recalc on startup — builds totals from SQLite instantly
  backgroundRecalcAndPrune();

  global._usageLimiterTimer = setInterval(backgroundRecalcAndPrune, RECALC_INTERVAL_MS);

  // Don't prevent process exit
  if (global._usageLimiterTimer.unref) {
    global._usageLimiterTimer.unref();
  }
}

export function stopBackgroundRecalc() {
  if (global._usageLimiterTimer) {
    clearInterval(global._usageLimiterTimer);
    global._usageLimiterTimer = null;
  }
}
