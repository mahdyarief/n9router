/**
 * Unit tests for open-sse/utils/streamHandler.js
 *
 * Focus:
 *  - The terminal-sentinel safety net: when an upstream stream is aborted/errored
 *    mid-flight, the SSE transform's flush() is skipped and the normal
 *    "data: [DONE]" is never produced. createDisconnectAwareStream must inject the
 *    sentinel on the abort/error close path, while NOT double-emitting on graceful EOF.
 *  - The streamWatchdogEnabled toggle: when OFF (legacy v0.4.35 behavior), the stall
 *    watchdog never arms and no terminal sentinel is injected on abort/error.
 *
 * createDisconnectAwareStream locks the writable internally, so — exactly like
 * the real caller pipeWithDisconnect — these tests hand it a { readable,
 * writable-stub } object and drive the readable side directly.
 */

import { describe, it, expect, vi } from "vitest";
import { createDisconnectAwareStream, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";
import { STREAM_STALL_TIMEOUT_MS } from "../../open-sse/config/runtimeConfig.js";

const enc = new TextEncoder();

// Minimal stand-in for createStreamController — records lifecycle calls and
// models the connected/disconnected flag the real controller exposes.
function makeController() {
  let connected = true;
  const calls = [];
  return {
    calls,
    signal: { aborted: false },
    startTime: Date.now(),
    isConnected: () => connected,
    handleComplete: () => { connected = false; calls.push("complete"); },
    handleError: (e) => { connected = false; calls.push(`error:${e?.message}`); },
    handleDisconnect: (r) => { connected = false; calls.push(`disconnect:${r}`); },
    abort: () => { calls.push("abort"); },
  };
}

// Mirror how pipeWithDisconnect calls createDisconnectAwareStream: a real
// readable plus a no-op writable stub (the function only .abort()s the writer).
function asTransformLike(readable) {
  return {
    readable,
    writable: { getWriter: () => ({ abort: () => Promise.resolve() }) },
  };
}

async function readAll(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += typeof value === "string" ? value : dec.decode(value, { stream: true });
  }
  return out;
}

function countSentinels(text) {
  return (text.match(/data: \[DONE\]/g) || []).length;
}

describe("createDisconnectAwareStream — terminal sentinel on abort/error", () => {
  it("injects data: [DONE] when upstream aborts mid-stream (AbortError)", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    // Deliver one chunk, then abort on the next read — mirrors the stall watchdog
    // aborting the fetch after some content has already streamed.
    let stage = 0;
    const readable = new ReadableStream({
      pull(c) {
        if (stage++ === 0) c.enqueue(enc.encode('data: {"hello":1}\n\n'));
        else c.error(abortErr);
      },
    });
    const ctrl = makeController();
    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl);

    const out = await readAll(client);
    expect(out).toContain('data: {"hello":1}');
    expect(out).toContain("data: [DONE]");
    expect(ctrl.calls.some((c) => c.startsWith("error:"))).toBe(true);
  });

  it("injects sentinel when the stall already fired before the first pull", async () => {
    const readable = new ReadableStream({
      start(c) { c.enqueue(enc.encode('data: {"x":1}\n\n')); },
    });
    const ctrl = makeController();
    // Stall timer fired between pulls in the real flow — controller no longer connected.
    ctrl.handleError(new Error("stream stall timeout"));

    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl);
    const out = await readAll(client);
    expect(out).toContain("data: [DONE]");
  });

  it("does NOT double-emit the sentinel on graceful EOF", async () => {
    const readable = new ReadableStream({
      start(c) {
        // Graceful path: the transform flush() already produced the terminal sentinel.
        c.enqueue(enc.encode('data: {"a":1}\n\n'));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    const ctrl = makeController();
    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl);

    const out = await readAll(client);
    expect(countSentinels(out)).toBe(1);
    expect(ctrl.calls).toContain("complete");
  });

  it("treats network resets (ECONNRESET) as a clean close with sentinel", async () => {
    const resetErr = new Error("socket hang up");
    resetErr.code = "ECONNRESET";
    let stage = 0;
    const readable = new ReadableStream({
      pull(c) {
        if (stage++ === 0) c.enqueue(enc.encode('data: {"a":1}\n\n'));
        else c.error(resetErr);
      },
    });
    const ctrl = makeController();
    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl);

    const out = await readAll(client);
    expect(out).toContain("data: [DONE]");
  });
});

describe("pipeWithDisconnect — end-to-end passthrough", () => {
  it("preserves a single terminal [DONE] on graceful upstream end", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"a":1}\n\n'));
        c.enqueue(enc.encode("data: [DONE]\n\n"));
        c.close();
      },
    });
    const providerResponse = { body };
    const transform = new TransformStream(); // identity
    const ctrl = makeController();

    const client = pipeWithDisconnect(providerResponse, transform, ctrl);
    const out = await readAll(client);

    expect(out).toContain('data: {"a":1}');
    expect(countSentinels(out)).toBe(1);
    expect(ctrl.calls).toContain("complete");
  });
});

describe("pipeWithDisconnect — watchdog enabled (default)", () => {
  it("arms the stall timer and aborts when the upstream goes silent", () => {
    vi.useFakeTimers();
    try {
      const ctrl = makeController();
      const body = new ReadableStream({ start() {} }); // silent upstream, no bytes ever
      pipeWithDisconnect({ body }, new TransformStream(), ctrl); // default ON

      // Before the window: no abort yet.
      vi.advanceTimersByTime(STREAM_STALL_TIMEOUT_MS - 1000);
      expect(ctrl.calls.some((c) => c.startsWith("error:"))).toBe(false);

      // Past the stall window: watchdog fires → error + abort.
      vi.advanceTimersByTime(2000);
      expect(ctrl.calls).toContain("error:stream stall timeout");
      expect(ctrl.calls).toContain("abort");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pipeWithDisconnect — watchdog disabled (legacy v0.4.35)", () => {
  it("never arms a stall timer when streamWatchdogEnabled=false", () => {
    vi.useFakeTimers();
    try {
      const ctrl = makeController();
      const body = new ReadableStream({ start() {} }); // silent upstream, no bytes ever
      pipeWithDisconnect({ body }, new TransformStream(), ctrl, false); // OFF

      // Advance far past the stall window — disabled watchdog must never fire.
      vi.advanceTimersByTime(STREAM_STALL_TIMEOUT_MS * 5 + 5000);

      expect(ctrl.calls.some((c) => c.startsWith("error:"))).toBe(false);
      expect(ctrl.calls).not.toContain("abort");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createDisconnectAwareStream — watchdog disabled (legacy v0.4.35)", () => {
  it("does NOT inject data: [DONE] on the abort/error path when disabled", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    let stage = 0;
    const readable = new ReadableStream({
      pull(c) {
        if (stage++ === 0) c.enqueue(enc.encode('data: {"hello":1}\n\n'));
        else c.error(abortErr);
      },
    });
    const ctrl = makeController();
    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl, false); // OFF

    const out = await readAll(client);
    expect(out).toContain('data: {"hello":1}');
    expect(countSentinels(out)).toBe(0); // no injected sentinel when disabled
    expect(ctrl.calls.some((c) => c.startsWith("error:"))).toBe(true);
  });

  it("still emits a single [DONE] on graceful EOF even when disabled", async () => {
    const readable = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"a":1}\n\n'));
        c.enqueue(enc.encode("data: [DONE]\n\n")); // produced by transform flush()
        c.close();
      },
    });
    const ctrl = makeController();
    const client = createDisconnectAwareStream(asTransformLike(readable), ctrl, false);
    const out = await readAll(client);
    expect(countSentinels(out)).toBe(1); // graceful path unaffected by flag
    expect(ctrl.calls).toContain("complete");
  });
});
