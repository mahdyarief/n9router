import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { resetKeyUsage, getResetHistory } from "@/lib/usageLimiter.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/keys/[id]/reset-usage
 * Resets usage data for the given API key within a specified time window.
 *
 * Body: { windowMs: number|null, windowLabel: string }
 *   windowMs   - milliseconds to look back and clear (null = all recorded time)
 *   windowLabel - human-readable label stored in history (e.g. "Last 24 hours")
 *
 * Response: { success, tokensCleared, costCleared }
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const keyRecord = await getApiKeyById(id);
    if (!keyRecord) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const body = await request.json();
    const { windowMs, windowLabel } = body;

    if (
      windowMs !== null &&
      windowMs !== undefined &&
      (typeof windowMs !== "number" || windowMs <= 0)
    ) {
      return NextResponse.json(
        { error: "windowMs must be a positive number or null" },
        { status: 400 }
      );
    }

    const result = resetKeyUsage(
      keyRecord.key,
      windowMs || null,
      windowLabel || "All time"
    );

    return NextResponse.json({
      success: true,
      tokensCleared: result.tokensCleared,
      costCleared: result.costCleared,
    });
  } catch (error) {
    console.log("Error resetting key usage:", error);
    return NextResponse.json({ error: "Failed to reset usage" }, { status: 500 });
  }
}

/**
 * GET /api/keys/[id]/reset-usage
 * Returns the reset history for the given API key (last 30 entries).
 *
 * Response: { history: [{id, window_ms, window_label, reset_at, tokens_cleared, cost_cleared}] }
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const keyRecord = await getApiKeyById(id);
    if (!keyRecord) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const history = getResetHistory(keyRecord.key);

    return NextResponse.json({ history });
  } catch (error) {
    console.log("Error fetching reset history:", error);
    return NextResponse.json({ error: "Failed to fetch reset history" }, { status: 500 });
  }
}
