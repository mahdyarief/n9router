import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { v4 as uuidv4 } from "uuid";
import { refreshKiroToken } from "../services/tokenRefresh.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { HTTP_STATUS, DEFAULT_KIRO_RETRY_COUNT, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";

// SSE keepalive comment. Emitted when raw EventStream bytes arrive but don't yet
// complete a parseable frame (partial-frame buffering during reasoning prefill).
// Keeps the downstream stall watchdog (pipeWithDisconnect) aware of upstream
// activity so it doesn't false-abort. Comment lines are dropped by the translate
// parser and ignored by SSE clients in passthrough.
const KIRO_KEEPALIVE = new TextEncoder().encode(": ka\n\n");

// Exponential backoff config for Kiro retries (mirrors MITM approach)
const KIRO_BACKOFF_BASE_MS = 2000;
const KIRO_BACKOFF_CAP_MS = 15000;

// Transient 400 patterns that should be retried (Kiro-specific false positives)
const KIRO_RETRYABLE_400_PATTERNS = ["improperly formed request"];

// Status codes eligible for in-executor retry with exponential backoff
const KIRO_RETRYABLE_STATUSES = new Set([400, 429, 500, 502, 503, 504]);

/**
 * KiroExecutor - Executor for Kiro AI (AWS CodeWhisperer)
 * Uses AWS CodeWhisperer streaming API with AWS EventStream binary format
 */
export class KiroExecutor extends BaseExecutor {
  constructor() {
    super("kiro", PROVIDERS.kiro);
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      ...this.config.headers,
      "Amz-Sdk-Request": "attempt=1; max=3",
      "Amz-Sdk-Invocation-Id": uuidv4()
    };

    if (credentials.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    }

    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    return body;
  }

  /**
   * Check if a 400 error is a known transient Kiro issue that should be retried.
   * Only retries specific patterns — genuine validation errors are not retried.
   */
  _isRetryable400(responseBody) {
    if (!responseBody) return false;
    const lower = responseBody.toLowerCase();
    return KIRO_RETRYABLE_400_PATTERNS.some(pattern => lower.includes(pattern));
  }

  /**
   * Custom execute for Kiro - handles AWS EventStream binary response with
   * exponential backoff retry (MITM-style) for transient errors.
   */
  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null, streamWatchdogEnabled = true }) {
    const url = this.buildUrl(model, stream, 0);
    const transformedBody = this.transformRequest(model, body, stream, credentials);
    
    // Resolve max retry count: per-account → global setting → default
    const maxRetries = credentials?.kiroRetryCount ?? DEFAULT_KIRO_RETRY_COUNT;
    let retryAttempts = 0;

    while (true) {
      const headers = this.buildHeaders(credentials, stream);

      // Abort if upstream doesn't return response headers within FETCH_CONNECT_TIMEOUT_MS.
      const connectCtrl = new AbortController();
      const connectTimer = setTimeout(() => connectCtrl.abort(new Error("fetch connect timeout")), FETCH_CONNECT_TIMEOUT_MS);
      const mergedSignal = signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal;

      let response;
      try {
        response = await proxyAwareFetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(transformedBody),
          signal: mergedSignal
        }, proxyOptions);
        // Headers received — body streaming is now governed by the stall watchdog.
        clearTimeout(connectTimer);
      } catch (error) {
        clearTimeout(connectTimer);
        // Connect timeout is internal: convert to a retryable network error
        const isConnectTimeout = connectCtrl.signal.aborted && error.name === "AbortError";
        if (isConnectTimeout) {
          if (maxRetries > 0 && retryAttempts < maxRetries) {
            retryAttempts++;
            const backoffMs = this._computeBackoff(retryAttempts);
            log?.debug?.("RETRY", `connect timeout retry ${retryAttempts}/${maxRetries} after ${(backoffMs / 1000).toFixed(1)}s`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          throw new Error(`Kiro upstream connect timeout after ${FETCH_CONNECT_TIMEOUT_MS}ms`);
        }
        throw error;
      }

      // Check if this status code is retryable
      if (!response.ok && KIRO_RETRYABLE_STATUSES.has(response.status)) {
        // For 400, only retry known transient patterns
        let isTransient400 = false;
        if (response.status === 400) {
          let bodyText = "";
          try { bodyText = await response.clone().text(); } catch { /* ignore */ }
          
          if (!this._isRetryable400(bodyText)) {
            // Genuine validation error — don't retry
            return { response, url, headers, transformedBody };
          }
          isTransient400 = true;
        }

        if (maxRetries > 0 && retryAttempts < maxRetries) {
          retryAttempts++;
          const backoffMs = this._computeBackoff(retryAttempts);
          log?.debug?.("RETRY", `${response.status} retry ${retryAttempts}/${maxRetries} after ${(backoffMs / 1000).toFixed(1)}s`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // Retries exhausted — remap transient 400 to 429 so Claude Code CLI
        // recognizes it as retryable (CLI only retries on 429/503, not 400)
        if (isTransient400) {
          const bodyText = await response.clone().text().catch(() => "");
          const remappedResponse = new Response(bodyText, {
            status: HTTP_STATUS.RATE_LIMITED,
            statusText: "Too Many Requests",
            headers: response.headers
          });
          log?.debug?.("RETRY", `400 → 429 remap after ${retryAttempts} retries (transient Kiro error)`);
          return { response: remappedResponse, url, headers, transformedBody };
        }
      }

      if (!response.ok) {
        return { response, url, headers, transformedBody };
      }

      // Success - transform and return
      const transformedResponse = this.transformEventStreamToSSE(response, model, streamWatchdogEnabled);
      return { response: transformedResponse, url, headers, transformedBody };
    }
  }

  /**
   * Compute exponential backoff with full jitter (MITM-style).
   * Formula: random in [0, min(cap, base * 2^(attempt-1))]
   * Prevents thundering herd when multiple requests hit errors simultaneously.
   */
  _computeBackoff(attempt) {
    const expCeiling = Math.min(KIRO_BACKOFF_CAP_MS, KIRO_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
    return Math.floor(Math.random() * expCeiling) + KIRO_BACKOFF_BASE_MS / 2;
  }

  /**
   * Transform AWS EventStream binary response to SSE text stream
   * Using TransformStream instead of ReadableStream.pull() to avoid Workers timeout
   */
  transformEventStreamToSSE(response, model, streamWatchdogEnabled = true) {
    let buffer = new Uint8Array(0);
    let chunkIndex = 0;
    const responseId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const state = {
      endDetected: false,
      finishEmitted: false,
      hasToolCalls: false,
      hasReasoningContent: false,
      reasoningChunkCount: 0,
      toolCallIndex: 0,
      seenToolIds: new Map()
    };

    const transformStream = new TransformStream({
      async transform(chunk, rawController) {
        // Shadow the controller so we can tell whether this call emitted anything.
        // Raw AWS EventStream frames can buffer for a long time (reasoning prefill)
        // producing no SSE output; the downstream stall watchdog measures THIS
        // stream's output, so a silent transform call looks like a stall and gets
        // aborted. When a chunk arrived but yielded no frame, emit a keepalive.
        let emitted = false;
        const controller = {
          enqueue: (d) => { emitted = true; rawController.enqueue(d); },
          error: (e) => rawController.error(e),
          terminate: () => rawController.terminate()
        };
        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        // Parse events from buffer
        let iterations = 0;
        const maxIterations = 1000;
        while (buffer.length >= 16 && iterations < maxIterations) {
          iterations++;
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const totalLength = view.getUint32(0, false);

          if (totalLength < 16 || totalLength > buffer.length || buffer.length < totalLength) break;

          const eventData = buffer.slice(0, totalLength);
          buffer = buffer.slice(totalLength);

          const event = parseEventFrame(eventData);
          if (!event) continue;

          const eventType = event.headers[":event-type"] || "";
          
          // Track total content length for token estimation
          if (!state.totalContentLength) state.totalContentLength = 0;
          if (!state.contextUsagePercentage) state.contextUsagePercentage = 0;

          // Handle assistantResponseEvent
          if (eventType === "assistantResponseEvent" && event.payload?.content) {
            const content = event.payload.content;
            state.totalContentLength += content.length;
            
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{
                index: 0,
                delta: chunkIndex === 0
                  ? { role: "assistant", content }
                  : { content },
                finish_reason: null
              }]
            };
            chunkIndex++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle reasoningContentEvent (Kiro thinking / reasoning)
          // Kiro returns reasoning as a separate event when the request system
          // prompt contains <thinking_mode>enabled</thinking_mode>. Surface it
          // as OpenAI delta.reasoning_content so downstream translators can map
          // it back to Claude thinking blocks / Anthropic reasoning, etc.
          if (eventType === "reasoningContentEvent") {
            const reasoning = event.payload?.reasoningContentEvent || event.payload || {};
            const reasoningText = (typeof reasoning === "string")
              ? reasoning
              : (reasoning.text || reasoning.content || "");
            if (reasoningText) {
              state.hasReasoningContent = true;
              state.totalContentLength += reasoningText.length;

              const reasoningDelta = state.reasoningChunkCount === 0 && chunkIndex === 0
                ? { role: "assistant", reasoning_content: reasoningText }
                : { reasoning_content: reasoningText };

              const chunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{
                  index: 0,
                  delta: reasoningDelta,
                  finish_reason: null
                }]
              };
              chunkIndex++;
              state.reasoningChunkCount++;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
          }

          // Handle codeEvent
          if (eventType === "codeEvent" && event.payload?.content) {
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{
                index: 0,
                delta: { content: event.payload.content },
                finish_reason: null
              }]
            };
            chunkIndex++;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle toolUseEvent
          if (eventType === "toolUseEvent" && event.payload) {
            state.hasToolCalls = true;
            const toolUse = event.payload;
            const toolUses = Array.isArray(toolUse) ? toolUse : [toolUse];

            for (const singleToolUse of toolUses) {
              const toolCallId = singleToolUse.toolUseId || `call_${Date.now()}`;
              const toolName = singleToolUse.name || "";
              const toolInput = singleToolUse.input;

              let toolIndex;
              const isNewTool = !state.seenToolIds.has(toolCallId);

              if (isNewTool) {
                toolIndex = state.toolCallIndex++;
                state.seenToolIds.set(toolCallId, toolIndex);

                const startChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{
                    index: 0,
                    delta: {
                      ...(chunkIndex === 0 ? { role: "assistant" } : {}),
                      tool_calls: [{
                        index: toolIndex,
                        id: toolCallId,
                        type: "function",
                        function: {
                          name: toolName,
                          arguments: ""
                        }
                      }]
                    },
                    finish_reason: null
                  }]
                };
                chunkIndex++;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(startChunk)}\n\n`));
              } else {
                toolIndex = state.seenToolIds.get(toolCallId);
              }

              if (toolInput !== undefined) {
                let argumentsStr;

                if (typeof toolInput === 'string') {
                  argumentsStr = toolInput;
                } else if (typeof toolInput === 'object') {
                  argumentsStr = JSON.stringify(toolInput);
                } else {
                  continue;
                }

                const argsChunk = {
                  id: responseId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: toolIndex,
                        function: {
                          arguments: argumentsStr
                        }
                      }]
                    },
                    finish_reason: null
                  }]
                };
                chunkIndex++;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(argsChunk)}\n\n`));
              }
            }
          }

          // Handle messageStopEvent
          if (eventType === "messageStopEvent") {
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: state.hasToolCalls ? "tool_calls" : "stop"
              }]
            };
            state.finishEmitted = true;
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }

          // Handle contextUsageEvent to extract contextUsagePercentage
          if (eventType === "contextUsageEvent" && event.payload?.contextUsagePercentage) {
            state.contextUsagePercentage = event.payload.contextUsagePercentage;
            // Mark that we received context usage event
            state.hasContextUsage = true;
          }

          // Handle meteringEvent - mark that we received it
          if (eventType === "meteringEvent") {
            state.hasMeteringEvent = true;
          }

          // Handle metricsEvent for token usage
          if (eventType === "metricsEvent") {
            // Extract usage data from metricsEvent payload
            const metrics = event.payload?.metricsEvent || event.payload;
            if (metrics && typeof metrics === 'object') {
              const inputTokens = metrics.inputTokens || 0;
              const outputTokens = metrics.outputTokens || 0;
              
              if (inputTokens > 0 || outputTokens > 0) {
                state.usage = {
                  prompt_tokens: inputTokens,
                  completion_tokens: outputTokens,
                  total_tokens: inputTokens + outputTokens
                };
              }
            }
          }

          // Emit final chunk only after receiving BOTH meteringEvent AND contextUsageEvent
          if (state.hasMeteringEvent && state.hasContextUsage && !state.finishEmitted) {
            state.finishEmitted = true;
            
            // Estimate tokens if not available from events
            if (!state.usage) {
              // Estimate output tokens from content length
              const estimatedOutputTokens = state.totalContentLength > 0 
                ? Math.max(1, Math.floor(state.totalContentLength / 4))
                : 0;
              
              // Estimate input tokens from contextUsagePercentage
              // Kiro models typically have 200k context window
              const estimatedInputTokens = state.contextUsagePercentage > 0
                ? Math.floor(state.contextUsagePercentage * 200000 / 100)
                : 0;
              
              state.usage = {
                prompt_tokens: estimatedInputTokens,
                completion_tokens: estimatedOutputTokens,
                total_tokens: estimatedInputTokens + estimatedOutputTokens
              };
            }
            
            const finishChunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: state.hasToolCalls ? "tool_calls" : "stop"
              }]
            };
            
            // Include usage in final chunk if available
            if (state.usage) {
              finishChunk.usage = state.usage;
            }
            
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
          }
        }

        if (iterations >= maxIterations) {
          console.warn("[Kiro] Max iterations reached in event parsing");
        }

        // Bytes arrived but yielded no SSE frame yet (partial-frame buffering
        // during reasoning prefill). Emit a keepalive so the downstream stall
        // watchdog registers upstream activity and doesn't false-abort.
        // Skipped when the watchdog is disabled (legacy v0.4.35 behavior).
        if (!emitted && streamWatchdogEnabled) {
          rawController.enqueue(KIRO_KEEPALIVE);
        }
      },

      flush(controller) {
        // Emit finish chunk if not already sent
        if (!state.finishEmitted) {
          state.finishEmitted = true;
          const finishChunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: state.hasToolCalls ? "tool_calls" : "stop"
            }]
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        }

        // Send final done message
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      }
    });

    // Pipe response body through transform stream
    if (!response.body) {
      return new Response("data: [DONE]\n\n", { status: response.status, headers: { "Content-Type": "text/event-stream" } });
    }
    const transformedStream = response.body.pipeThrough(transformStream);

    return new Response(transformedStream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  async refreshCredentials(credentials, log, proxyOptions = null) {
    if (!credentials.refreshToken) return null;

    try {
      // Use centralized refreshKiroToken function (handles both AWS SSO OIDC and Social Auth)
      const result = await refreshKiroToken(
        credentials.refreshToken,
        credentials.providerSpecificData,
        log,
        proxyOptions
      );

      return result;
    } catch (error) {
      log?.error?.("TOKEN", `Kiro refresh error: ${error.message}`);
      return null;
    }
  }
}

/**
 * Parse AWS EventStream frame
 */
function parseEventFrame(data) {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const headersLength = view.getUint32(4, false);

    // Parse headers
    const headers = {};
    let offset = 12; // After prelude
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;

      const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
      offset += nameLen;

      const headerType = data[offset];
      offset++;

      if (headerType === 7) { // String type
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;

        const value = new TextDecoder().decode(data.slice(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    // Parse payload
    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4; // Exclude message CRC

    let payload = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = new TextDecoder().decode(data.slice(payloadStart, payloadEnd));

      // Skip empty or whitespace-only payloads
      if (!payloadStr || !payloadStr.trim()) {
        return { headers, payload: null };
      }

      try {
        payload = JSON.parse(payloadStr);
      } catch (parseError) {
        // Log parse error for debugging
        console.warn(`[Kiro] Failed to parse payload: ${parseError.message} | payload: ${payloadStr.substring(0, 100)}`);
        payload = { raw: payloadStr };
      }
    }

    return { headers, payload };
  } catch {
    return null;
  }
}

export default KiroExecutor;
