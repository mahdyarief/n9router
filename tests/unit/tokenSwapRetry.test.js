import { describe, expect, it } from "vitest";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const retryPath = path.resolve("../src/mitm/tokenSwapRetry.js");

describe("MITM token-swap retry classification", () => {
  const { getTokenSwapRetryType, isRetryableTokenSwapStatus } = require(retryPath);

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
});
