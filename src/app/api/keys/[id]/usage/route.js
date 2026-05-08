import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { getUsageSummary } from "@/lib/usageLimiter.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/keys/[id]/usage
 * Returns current rolling-window usage vs configured limits for an API key.
 * Reads fresh from SQLite (not in-memory cache) for dashboard accuracy.
 *
 * Response:
 * {
 *   keyId, keyName,
 *   usage: { inputTokens5h, inputTokens24h, cost5h, cost24h },
 *   windowUsage: { "tokens_${durationMs}": number, "cost_${durationMs}": number },
 *   limits: { inputTokens5h?, inputTokens24h?, cost5h?, cost24h?, windows?: [{durationMs, label, inputTokens, cost}] },
 *   status: "ok" | "warning" | "blocked" | "unlimited"
 * }
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const keyRecord = await getApiKeyById(id);
    if (!keyRecord) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const summary = await getUsageSummary(keyRecord.key);

    return NextResponse.json({
      keyId: id,
      keyName: keyRecord.name,
      usage: summary.usage,
      windowUsage: summary.windowUsage || {},
      limits: summary.limits,
      status: getStatus(summary),
    });
  } catch (error) {
    console.log("Error fetching key usage:", error);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}

function getStatus({ usage, windowUsage, limits }) {
  if (!limits || !Object.keys(limits).length) return "unlimited";

  // Build checks array with legacy fields
  const checks = [
    { limit: limits.inputTokens5h, current: usage.inputTokens5h },
    { limit: limits.inputTokens24h, current: usage.inputTokens24h },
    { limit: limits.cost5h, current: usage.cost5h },
    { limit: limits.cost24h, current: usage.cost24h },
  ];

  // Add custom window checks
  if (limits.windows && Array.isArray(limits.windows)) {
    for (const win of limits.windows) {
      if (!win.durationMs) continue;
      const tokenKey = `tokens_${win.durationMs}`;
      const costKey = `cost_${win.durationMs}`;
      if (win.inputTokens && windowUsage[tokenKey] !== undefined) {
        checks.push({ limit: win.inputTokens, current: windowUsage[tokenKey] });
      }
      if (win.cost && windowUsage[costKey] !== undefined) {
        checks.push({ limit: win.cost, current: windowUsage[costKey] });
      }
    }
  }

  // Blocked: any limit at or over threshold
  for (const { limit, current } of checks) {
    if (limit && current >= limit) return "blocked";
  }

  // Warning: any limit above 80%
  for (const { limit, current } of checks) {
    if (limit && current / limit > 0.8) return "warning";
  }

  return "ok";
}
