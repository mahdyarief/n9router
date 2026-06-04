import { describe, expect, it } from "vitest";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const retryPath = path.resolve("../src/mitm/tokenSwapRetry.js");

describe("MITM token-swap retry classification", () => {
  const {
    formatLocalTimestamp,
    getTokenLiveDuration,
    getTokenSwapRetryType,
    isRetryableAuthFailure,
    isRetryableTokenSwapStatus,
  } = require(retryPath);

  it("treats 500 as a retryable server error", () => {
    expect(isRetryableTokenSwapStatus(500)).toBe(true);
    expect(getTokenSwapRetryType(500)).toBe("server_error");
  });

  it("keeps success and non-retryable client errors out of retry handling", () => {
    expect(isRetryableTokenSwapStatus(200)).toBe(false);
    expect(isRetryableTokenSwapStatus(404)).toBe(false);
    expect(getTokenSwapRetryType(200)).toBeNull();
    expect(getTokenSwapRetryType(404)).toBeNull();
  });

  it("preserves existing auth, permission, and quota retry types", () => {
    expect(getTokenSwapRetryType(401)).toBe("auth");
    expect(getTokenSwapRetryType(403)).toBe("permission");
    expect(getTokenSwapRetryType(429)).toBe("quota");
    expect(getTokenSwapRetryType(503)).toBe("quota");
  });

  it("treats any token-swap 401 as refreshable auth", () => {
    expect(isRetryableAuthFailure(401, {}, "")).toBe(true);
    expect(isRetryableAuthFailure(401, {}, JSON.stringify({
      error: {
        code: 401,
        message: "Request had invalid authentication credentials.",
      },
    }))).toBe(true);
    expect(isRetryableAuthFailure(401, { "www-authenticate": "Bearer error=\"invalid_token\"" }, "")).toBe(true);
    expect(isRetryableAuthFailure(403, {}, "")).toBe(false);
  });

  it("formats live, expired, missing, and invalid token lifetimes", () => {
    const now = new Date("2026-06-04T10:00:00.000Z").getTime();

    expect(getTokenLiveDuration({
      expiresAt: "2026-06-04T10:30:05.000Z",
    }, now)).toEqual({
      expiresAt: "2026-06-04T10:30:05.000Z",
      expiresAtLocal: formatLocalTimestamp("2026-06-04T10:30:05.000Z"),
      expiresInMs: 30 * 60_000 + 5000,
      status: "live",
      label: `ttl=30m5s expiresAt=${formatLocalTimestamp("2026-06-04T10:30:05.000Z")}`,
    });

    expect(getTokenLiveDuration({
      expiresAt: "2026-06-04T09:59:50.000Z",
    }, now).label).toBe(`ttl=expired-10s expiresAt=${formatLocalTimestamp("2026-06-04T09:59:50.000Z")}`);

    expect(getTokenLiveDuration({}, now).label).toBe("ttl=unknown expiresAt=missing");
    expect(getTokenLiveDuration({ expiresAt: "not-a-date" }, now).label).toBe("ttl=invalid expiresAt=not-a-date");
  });
});
