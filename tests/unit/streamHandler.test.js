/**
 * Unit tests for open-sse/utils/streamHandler.js
 *
 * Focus: the terminal-sentinel safety net (Bug 2). When an upstream stream is
 * aborted/errored mid-flight, the SSE transform's flush() is skipped and the
 * normal "data: [DONE]" is never produced — leaving clients hanging on a
 * truncated response. createDisconnectAwareStream must inject the sentinel on
 * the abort/error close path, while NOT double-emitting on graceful EOF.
 *
 * createDisconnectAwareStream locks the writable internally, so — exactly like
 * the real caller pipeWithDisconnect — these tests hand it a { readable,
 * writable-stub } object and drive the readable side directly.
 */

import { describe, it, expect } from "vitest";
import { createDisconnectAwareStream, pipeWithDisconnect } from "../../open-sse/utils/streamHandler.js";

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
