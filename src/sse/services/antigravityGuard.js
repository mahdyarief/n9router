import { getSettings, getProviderConnections } from "@/lib/localDb";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";

/**
 * Antigravity payload guard — call before the credential selection loop.
 *
 * Returns one of:
 *   { blocked: true,  response }          — caller must return response immediately
 *   { blocked: false, excludeIds: Set }   — caller uses excludeIds as initial excludeConnectionIds
 *
 * Guard ON  (default): non-IDE requests return 403.
 * Guard OFF           : non-IDE requests allowed but @gmail.com accounts are pre-excluded.
 * IDE requests        : no restriction regardless of guard state.
 */
export async function checkAntigravityGuard({ provider, body, request }) {
  const empty = { blocked: false, excludeIds: new Set() };

  if (provider !== "antigravity") return empty;

  const settings = await getSettings();
  const guardEnabled = settings.mitmAntigravityPayloadGuardEnabled !== false;

  const sourceFormat = request?.url
    ? detectFormatByEndpoint(new URL(request.url).pathname, body)
    : null;
  const isNonIdeFormat = sourceFormat === "claude" || sourceFormat === "openai" || sourceFormat === "openai-responses";
  const hasIdeMarkers = body?.userAgent === "antigravity" && typeof body?.requestType === "string";
  const isNonIdeRequest = isNonIdeFormat || (!hasIdeMarkers && sourceFormat !== null);

  if (!isNonIdeRequest) return empty;

  if (guardEnabled) {
    log.warn("AUTH", `[antigravity] payload guard: request from non-IDE tool blocked (format=${sourceFormat || "unknown"})`);
    return {
      blocked: true,
      response: errorResponse(HTTP_STATUS.FORBIDDEN, "Antigravity provider is reserved for the Antigravity IDE. Requests from other tools are not allowed."),
    };
  }

  // Guard off — exclude @gmail.com accounts so the fallback loop never picks them
  const allConns = await getProviderConnections({ provider: "antigravity", isActive: true });
  const excludeIds = new Set(
    allConns
      .filter(c => (c.email || "").toLowerCase().endsWith("@gmail.com"))
      .map(c => c.id)
  );
  if (excludeIds.size > 0) {
    log.info("AUTH", `[antigravity] payload guard off: excluding ${excludeIds.size} gmail account(s) for non-IDE request`);
  }
  return { blocked: false, excludeIds };
}
