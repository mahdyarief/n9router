import { EventEmitter } from "events";
import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { pipeSSE } = require("../../src/mitm/handlers/base.js");

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.body = "";
    this.destroyed = false;
    this.headers = null;
    this.headersSent = false;
    this.statusCode = null;
    this.writableEnded = false;
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.headersSent = true;
  }

  write(chunk) {
    this.body += String(chunk);
    return true;
  }

  end(chunk = "") {
    if (chunk) this.body += String(chunk);
    this.writableEnded = true;
  }
}

function makeHeaders(contentType) {
  return {
    get(name) {
      return name.toLowerCase() === "content-type" ? contentType : null;
    },
  };
}

describe("MITM pipeSSE", () => {
  it("closes the client response when the router stream terminates", async () => {
    const response = new FakeResponse();
    const debugContext = { logError: vi.fn(), logResponse: vi.fn() };
    const encoded = new TextEncoder().encode("data: partial\n\n");
    let reads = 0;
    const routerRes = {
      status: 200,
      headers: makeHeaders("text/event-stream"),
      body: {
        getReader() {
          return {
            async read() {
              reads += 1;
              if (reads === 1) return { done: false, value: encoded };
              throw new TypeError("terminated");
            },
            async cancel() {},
            releaseLock() {},
          };
        },
      },
    };

    await expect(pipeSSE(routerRes, response, debugContext)).resolves.toBeUndefined();

    expect(response.headersSent).toBe(true);
    expect(response.writableEnded).toBe(true);
    expect(response.body).toBe("data: partial\n\n");
    expect(debugContext.logError).toHaveBeenCalledWith(
      "router.stream_error",
      expect.any(TypeError),
      expect.objectContaining({ partialBytes: encoded.length })
    );
    expect(debugContext.logResponse).not.toHaveBeenCalled();
  });
});
