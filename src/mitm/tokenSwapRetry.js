const RETRYABLE_TOKEN_SWAP_STATUSES = new Set([401, 403, 429, 500, 503]);

function getTokenSwapRetryType(statusCode) {
  const status = Number(statusCode);
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 429 || status === 503) return "quota";
  if (status === 500) return "server_error";
  return null;
}

function isRetryableTokenSwapStatus(statusCode) {
  return RETRYABLE_TOKEN_SWAP_STATUSES.has(Number(statusCode));
}

function getHeaderValue(headers, name) {
  const value = headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}

function isRetryableAuthFailure(statusCode, headers, body) {
  if (Number(statusCode) !== 401) return false;

  const authHeader = getHeaderValue(headers, "www-authenticate").toLowerCase();
  if (authHeader.includes("invalid_token")) return true;

  try {
    const parsed = JSON.parse(body || "{}");
    const status = String(parsed?.error?.status || parsed?.status || "").toUpperCase();
    const code = Number(parsed?.error?.code || parsed?.code || 0);
    const message = String(parsed?.error?.message || parsed?.message || "").toLowerCase();
    if (status === "UNAUTHENTICATED") return true;
    if (code === 401) return true;
    if (message.includes("invalid authentication credentials")) return true;
    if (message.includes("invalid token")) return true;
    if (message.includes("expired")) return true;
    if (message.includes("unauthenticated")) return true;
  } catch {
    const fallback = String(body || "").toLowerCase();
    if (fallback.includes("invalid authentication credentials")) return true;
    if (fallback.includes("invalid token")) return true;
    if (fallback.includes("expired")) return true;
    if (fallback.includes("unauthenticated")) return true;
  }

  // In token-swap mode a 401 from the upstream OAuth API almost always means
  // the swapped bearer token is stale. Force one refresh before giving up.
  return true;
}

function formatDurationMs(ms) {
  const absMs = Math.abs(Number(ms));
  if (!Number.isFinite(absMs)) return "unknown";
  if (absMs < 1000) return "0s";

  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes || hours) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join("");
}

function formatLocalTimestamp(value) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getTokenLiveDuration(connection, now = Date.now()) {
  if (!connection?.expiresAt) {
    return {
      expiresAt: null,
      expiresAtLocal: null,
      expiresInMs: null,
      status: "unknown",
      label: "ttl=unknown expiresAt=missing",
    };
  }

  const expiresAtMs = new Date(connection.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return {
      expiresAt: connection.expiresAt,
      expiresAtLocal: String(connection.expiresAt),
      expiresInMs: null,
      status: "invalid",
      label: `ttl=invalid expiresAt=${connection.expiresAt}`,
    };
  }

  const expiresInMs = expiresAtMs - now;
  const status = expiresInMs >= 0 ? "live" : "expired";
  const duration = formatDurationMs(expiresInMs);
  const ttl = status === "live" ? duration : `expired-${duration}`;

  return {
    expiresAt: connection.expiresAt,
    expiresAtLocal: formatLocalTimestamp(connection.expiresAt),
    expiresInMs,
    status,
    label: `ttl=${ttl} expiresAt=${formatLocalTimestamp(connection.expiresAt)}`,
  };
}

module.exports = {
  formatLocalTimestamp,
  getTokenSwapRetryType,
  getTokenLiveDuration,
  isRetryableAuthFailure,
  isRetryableTokenSwapStatus,
};
