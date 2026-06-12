// Gemini helper functions for translator

// Unsupported JSON Schema constraints that should be removed for Antigravity
export const UNSUPPORTED_SCHEMA_CONSTRAINTS = [
  // Basic constraints (not supported by Gemini API)
  "minLength", "maxLength", "exclusiveMinimum", "exclusiveMaximum",
  "pattern", "minItems", "maxItems", "format",
  // Claude rejects these in VALIDATED mode
  "default", "examples",
  // JSON Schema meta keywords
  "$schema", "$defs", "definitions", "const", "$ref",
  // Object validation keywords (not supported)
  "additionalProperties", "propertyNames", "patternProperties",
  // Complex schema keywords (handled by flattenAnyOfOneOf/mergeAllOf)
  "anyOf", "oneOf", "allOf", "not",
  // Dependency keywords (not supported)
  "dependencies", "dependentSchemas", "dependentRequired",
  // Other unsupported keywords
  "title", "if", "then", "else", "contentMediaType", "contentEncoding",
  // UI/Styling properties (from Cursor tools - NOT JSON Schema standard)
  "cornerRadius", "fillColor", "fontFamily", "fontSize", "fontWeight",
  "gap", "padding", "strokeColor", "strokeThickness", "textColor"
];

// Default safety settings
export const DEFAULT_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
];

// Convert OpenAI content to Gemini parts
export function convertOpenAIContentToParts(content) {
  const parts = [];

  if (typeof content === "string") {
    parts.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === "text") {
        parts.push({ text: item.text });
      } else if (item.type === "image_url" && item.image_url?.url?.startsWith("data:")) {
        const url = item.image_url.url;
        const commaIndex = url.indexOf(",");
        if (commaIndex !== -1) {
          const mimePart = url.substring(5, commaIndex); // skip "data:"
          const data = url.substring(commaIndex + 1);
          const mimeType = mimePart.split(";")[0];

          parts.push({
            inlineData: { mime_type: mimeType, data: data }
          });
        }
      } else if (item.type === "image_url" && item.image_url?.url && (item.image_url.url.startsWith("http://") || item.image_url.url.startsWith("https://"))) {
        parts.push({
          fileData: { fileUri: item.image_url.url, mimeType: "image/*" }
        });
      }
    }
  }

  return parts;
}

// Extract text content from OpenAI content
export function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === "text").map(c => c.text).join("");
  }
  return "";
}

// Try parse JSON safely
export function tryParseJSON(str) {
  if (typeof str !== "string") return str;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Generate request ID
export function generateRequestId() {
  return `agent-${crypto.randomUUID()}`;
}

// Generate session ID (binary-compatible format: UUID + timestamp)
export function generateSessionId() {
  return crypto.randomUUID() + Date.now().toString();
}

// Generate project ID
export function generateProjectId() {
  const adjectives = ["useful", "bright", "swift", "calm", "bold"];
  const nouns = ["fuze", "wave", "spark", "flow", "core"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}-${noun}-${crypto.randomUUID().slice(0, 5)}`;
}

// Helper: Remove unsupported keywords recursively from object/array
// Also strips all vendor extension fields (x- prefixed) not supported by Gemini
function removeUnsupportedKeywords(obj, keywords) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      removeUnsupportedKeywords(item, keywords);
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (keywords.includes(key) || key.startsWith("x-")) {
        delete obj[key];
      }
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        removeUnsupportedKeywords(value, keywords);
      }
    }
  }
}

// Convert const to enum
function convertConstToEnum(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.const !== undefined && !obj.enum) {
    obj.enum = [obj.const];
    delete obj.const;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      convertConstToEnum(value);
    }
  }
}

// Convert enum values to strings (Gemini requires string enum values + explicit type:"string")
function convertEnumValuesToStrings(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.enum && Array.isArray(obj.enum)) {
    obj.enum = obj.enum.map(v => String(v));
    // Gemini API requires type:"string" when enum is present — without it returns 400
    if (!obj.type) {
      obj.type = "string";
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      convertEnumValuesToStrings(value);
    }
  }
}

// Merge allOf schemas
function mergeAllOf(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.allOf && Array.isArray(obj.allOf)) {
    const merged = {};

    for (const item of obj.allOf) {
      if (item.properties) {
        if (!merged.properties) merged.properties = {};
        Object.assign(merged.properties, item.properties);
      }
      if (item.required && Array.isArray(item.required)) {
        if (!merged.required) merged.required = [];
        for (const req of item.required) {
          if (!merged.required.includes(req)) {
            merged.required.push(req);
          }
        }
      }
    }

    delete obj.allOf;
    if (merged.properties) obj.properties = { ...obj.properties, ...merged.properties };
    if (merged.required) obj.required = [...(obj.required || []), ...merged.required];
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      mergeAllOf(value);
    }
  }
}

// Select best schema from anyOf/oneOf
function selectBest(items) {
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let score = 0;
    const type = item.type;

    if (type === "object" || item.properties) {
      score = 3;
    } else if (type === "array" || item.items) {
      score = 2;
    } else if (type && type !== "null") {
      score = 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// Flatten anyOf/oneOf
function flattenAnyOfOneOf(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.anyOf && Array.isArray(obj.anyOf) && obj.anyOf.length > 0) {
    const nonNullSchemas = obj.anyOf.filter(s => s && s.type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete obj.anyOf;
      Object.assign(obj, selected);
    }
  }

  if (obj.oneOf && Array.isArray(obj.oneOf) && obj.oneOf.length > 0) {
    const nonNullSchemas = obj.oneOf.filter(s => s && s.type !== "null");
    if (nonNullSchemas.length > 0) {
      const bestIdx = selectBest(nonNullSchemas);
      const selected = nonNullSchemas[bestIdx];
      delete obj.oneOf;
      Object.assign(obj, selected);
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      flattenAnyOfOneOf(value);
    }
  }
}

// Flatten type arrays
function flattenTypeArrays(obj) {
  if (!obj || typeof obj !== "object") return;

  if (obj.type && Array.isArray(obj.type)) {
    const nonNullTypes = obj.type.filter(t => t !== "null");
    obj.type = nonNullTypes.length > 0 ? nonNullTypes[0] : "string";
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      flattenTypeArrays(value);
    }
  }
}

// Clean JSON Schema for Antigravity API compatibility - removes unsupported keywords recursively
export function cleanJSONSchemaForAntigravity(schema) {
  if (!schema || typeof schema !== "object") return schema;

  // Mutate directly (schema is only used once per request)
  let cleaned = schema;

  // Phase 1: Convert and prepare
  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);

  // Phase 2: Flatten complex structures
  mergeAllOf(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);

  // Phase 3: Remove all unsupported keywords at ALL levels (including inside arrays)
  removeUnsupportedKeywords(cleaned, UNSUPPORTED_SCHEMA_CONSTRAINTS);

  // Phase 4: Cleanup required fields recursively
  function cleanupRequired(obj) {
    if (!obj || typeof obj !== "object") return;

    if (obj.required && Array.isArray(obj.required) && obj.properties) {
      const validRequired = obj.required.filter(field =>
        Object.prototype.hasOwnProperty.call(obj.properties, field)
      );
      if (validRequired.length === 0) {
        delete obj.required;
      } else {
        obj.required = validRequired;
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        cleanupRequired(value);
      }
    }
  }

  cleanupRequired(cleaned);

  // Phase 5: Add placeholder for empty object schemas (Antigravity requirement)
  function addPlaceholders(obj) {
    if (!obj || typeof obj !== "object") return;

    if (obj.type === "object") {
      if (!obj.properties || Object.keys(obj.properties).length === 0) {
        obj.properties = {
          reason: {
            type: "string",
            description: "Brief explanation of why you are calling this tool"
          }
        };
        obj.required = ["reason"];
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        addPlaceholders(value);
      }
    }
  }

  addPlaceholders(cleaned);

  return cleaned;
}

// ============================================================================
// NORMALIZE: Fix Gemini turn sequence violations
// ============================================================================
// Gemini/Antigravity requires strict alternation: user → model → user → model
// and requires functionCall to be followed by a user turn with functionResponse.
// Clients (Cursor, Claude Code, etc.) often send sequences that violate these
// rules. This function normalizes the sequence to always be valid.
export function normalizeGeminiTurns(contents) {
  if (!Array.isArray(contents) || contents.length === 0) return contents;

  // Step 1: Merge adjacent turns with the same role
  const merged = [contents[0]];
  for (let i = 1; i < contents.length; i++) {
    const last = merged[merged.length - 1];
    const cur = contents[i];
    if (last.role === cur.role) {
      last.parts = [...(last.parts || []), ...(cur.parts || [])];
    } else {
      merged.push({ role: cur.role, parts: [...(cur.parts || [])] });
    }
  }

  // Step 2: Insert synthetic functionResponse for orphaned functionCalls
  // If a model turn contains functionCall but no subsequent user turn has the matching
  // functionResponse, synthesize one so Gemini doesn't return INVALID_ARGUMENT
  const result = [];
  for (let i = 0; i < merged.length; i++) {
    const turn = merged[i];
    const funcCalls = (turn.parts || []).filter(p => p.functionCall);
    result.push(turn);

    if (funcCalls.length > 0 && turn.role === "model") {
      const nextTurn = merged[i + 1];
      const hasResponse = nextTurn &&
        nextTurn.role === "user" &&
        (nextTurn.parts || []).some(p => p.functionResponse);

      if (!hasResponse) {
        // Synthesize functionResponse turn
        const syntheticParts = funcCalls.map(fc => ({
          functionResponse: {
            id: fc.functionCall.id,
            name: fc.functionCall.name || "_unknown",
            response: {
              result: {
                _synthetic: true,
                message: "Tool response not provided by client"
              }
            }
          }
        }));
        result.push({ role: "user", parts: syntheticParts });
      }
    }
  }

  // Step 3: Enforce user ↔ model alternation
  const output = [];
  for (let i = 0; i < result.length; i++) {
    const turn = result[i];
    const expectedRole = output.length === 0 ? "user" : (output[output.length - 1].role === "user" ? "model" : "user");

    if (turn.role === expectedRole) {
      output.push(turn);
      continue;
    }

    // Special cases for tool call/response sequences
    const hasFuncCall = (turn.parts || []).some(p => p.functionCall);
    const hasFuncResponse = (turn.parts || []).some(p => p.functionResponse);

    if (hasFuncCall && expectedRole === "user") {
      // functionCall needs to be in a model turn, insert padding user turn
      output.push({ role: "user", parts: [{ text: "Continue." }] });
      output.push(turn);
    } else if (hasFuncResponse && expectedRole === "model") {
      // functionResponse needs to be in a user turn, insert padding model turn
      output.push({ role: "model", parts: [{ text: "" }] });
      output.push(turn);
    } else if (!hasFuncCall && !hasFuncResponse) {
      // Pure text turn with wrong role — swap role to fit alternation
      output.push({ role: expectedRole, parts: turn.parts || [] });
    } else {
      // Fallback: insert empty padding turn
      output.push({ role: expectedRole, parts: [{ text: " " }] });
      output.push(turn);
    }
  }

  // Step 4: Ensure first turn is always "user"
  if (output.length > 0 && output[0].role !== "user") {
    output.unshift({ role: "user", parts: [{ text: " " }] });
  }

  // Step 5: Ensure every turn has at least one part
  for (const turn of output) {
    if (!turn.parts || turn.parts.length === 0) {
      turn.parts = [{ text: " " }];
    }
  }

  // Step 6: If the last turn has a functionCall, add a synthetic functionResponse
  // (Gemini requires every functionCall to have a matching functionResponse)
  const lastTurn = output[output.length - 1];
  if (lastTurn && (lastTurn.parts || []).some(p => p.functionCall)) {
    const funcCalls = (lastTurn.parts || []).filter(p => p.functionCall);
    const responseParts = funcCalls
      .filter(p => p.functionCall?.id)
      .map(p => ({
        functionResponse: {
          id: p.functionCall.id,
          name: p.functionCall.name || "_unknown",
          response: {
            result: {
              _synthetic: true,
              message: "Tool response not provided by client"
            }
          }
        }
      }));
    if (responseParts.length > 0) {
      output.push({ role: "user", parts: responseParts });
    }
  }

  return output;
}

// ============================================================================
// SMART TRUNCATE: Reduce oversized payloads to fit upstream limits
// ============================================================================
// Kiro rejects >8MB, Antigravity/Gemini rejects >6MB, Next.js truncates at 10MB.
// This function drops middle turns and trims long text/thinking blocks to fit.
const MAX_SERIALIZED_SIZE = 2 * 1024 * 1024; // 2MB — safe threshold to start truncation
const TARGET_SERIALIZED_SIZE = 4 * 1024 * 1024; // 4MB — target after truncation
const MAX_TEXT_BLOCK = 50000; // 50K chars per text block before trimming
const MAX_THINKING_BLOCK = 20000; // 20K chars per thinking block before trimming

export function smartTruncate(contents) {
  if (!Array.isArray(contents) || contents.length <= 4) return contents;

  const serialized = JSON.stringify(contents);
  if (serialized.length <= MAX_SERIALIZED_SIZE) return contents;

  // Strategy: Keep first (system/setup) and last (recent context) turns,
  // drop middle turns until we're under the target size
  const head = contents[0];
  const tail = contents[contents.length - 1];
  let middle = contents.slice(1, -1);

  // Drop oldest middle turns first (keep most recent)
  while (middle.length > 1 && JSON.stringify([head, ...middle, tail]).length > TARGET_SERIALIZED_SIZE) {
    middle = middle.slice(2); // Drop 2 turns at a time to preserve alternation
  }

  const result = [head, ...middle, tail];

  // Additionally, trim oversized text blocks within remaining turns
  for (const turn of result) {
    if (!turn.parts || !Array.isArray(turn.parts)) continue;

    for (const part of turn.parts) {
      // Trim long text blocks
      if (part.text && part.text.length > MAX_TEXT_BLOCK) {
        const originalLen = part.text.length;
        part.text = part.text.substring(0, 25000)
          + `\n... [truncated by n9router: original ${originalLen} chars] ...\n`
          + part.text.substring(part.text.length - 25000);
      }

      // Trim long thinking/reasoning blocks
      if (part.thought === true && part.text && part.text.length > MAX_THINKING_BLOCK) {
        part.text = part.text.substring(0, 10000)
          + "\n... [thinking truncated] ...\n";
      }
    }
  }

  return result;
}

