/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  LLMProvider,
  LLMMessage,
  ToolCallRequest,
  ToolDefinition,
  ChatOptions,
  ChatResponse,
  ModelInfo,
} from "./types";
import { GeminiCache, DEFAULT_RECACHE_THRESHOLD } from "../lib/geminiCache";
import { debugLog } from "../lib/debugLog";
import { buildRequestUrl } from "./proxyUrl";
import { withCustomHeaders } from "../lib/customHeaders";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MIN_CACHE_TOKENS = 1024;

export class GeminiProvider implements LLMProvider {
  private cache = new GeminiCache();

  constructor(
    public readonly id: string = "gemini",
    public readonly label: string = "Google Gemini",
    public readonly requiresKey: boolean = true,
    public readonly defaultModel: string = "gemini-3.5-flash-lite"
  ) {}

  resetCache(): void {
    this.cache.reset();
  }

  /**
   * Best-effort delete of the remote cache that survives taskpane close,
   * stopping idle-storage billing once the conversation is gone.
   */
  flushCache(): void {
    this.cache.flushRemote();
  }

  async listModels(
    apiKey: string,
    baseUrl?: string,
    proxyRequests?: boolean
  ): Promise<ModelInfo[]> {
    const url = buildRequestUrl(baseUrl || DEFAULT_BASE, "/models", proxyRequests);

    const res = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      models?: { name: string; displayName?: string }[];
    };
    return (data.models || [])
      .filter((m) => m.name && m.name.includes("gemini"))
      .filter((m) => !m.name.includes("-thinking")) // skip thinking variants
      .map((m) => ({
        id: m.name.replace("models/", ""),
        name: m.displayName || m.name.replace("models/", ""),
      }));
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    const model = options.model;
    const baseUrl = options.baseUrl || DEFAULT_BASE;
    const url = buildRequestUrl(
      baseUrl,
      `/models/${model}:generateContent`,
      options.proxyRequests
    );

    this.cache.setConfig(options.apiKey, baseUrl);

    const res = await this._request(url, messages, tools, model, options);

    const data = (await res.json()) as GeminiResponse;
    return parseGeminiResponse(data);
  }

  async chatStream(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: ToolCallRequest) => void,
    tools: ToolDefinition[],
    options: ChatOptions,
    onReasoningToken?: (token: string) => void,
    onFinish?: (info: { finishReason: "stop" | "length" | "error" }) => void
  ): Promise<void> {
    const model = options.model;
    const baseUrl = options.baseUrl || DEFAULT_BASE;
    const url = buildRequestUrl(
      baseUrl,
      `/models/${model}:streamGenerateContent?alt=sse`,
      options.proxyRequests
    );

    this.cache.setConfig(options.apiKey, baseUrl);

    const res = await this._request(url, messages, tools, model, options);

    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const pendingToolCalls = new Map<number, ToolCallRequest>();
    let pendingThoughtSignature: string | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const chunk = JSON.parse(jsonStr) as GeminiStreamChunk;
            for (const candidate of chunk.candidates || []) {
              const parts = candidate.content?.parts || [];
              for (const part of parts) {
                // Handle reasoning/thoughts — also capture thought_signature
                if (part.thought) {
                  const thought = typeof part.thought === "string" ? { text: part.thought } : part.thought;
                  if (thought.thought_signature) {
                    pendingThoughtSignature = thought.thought_signature;
                  }
                  if (onReasoningToken) {
                    onReasoningToken(thought.text || "");
                  }
                }

                // Handle text content
                if (part.text) {
                  onToken(part.text);
                }

                // Handle function calls
                if (part.functionCall) {
                  const fc = part.functionCall;
                  const sig = part.thoughtSignature || pendingThoughtSignature;
                  pendingThoughtSignature = undefined;
                  const idx = pendingToolCalls.size;
                  pendingToolCalls.set(idx, {
                    id: `gemini_call_${idx}`,
                    type: "function",
                    function: {
                      name: fc.name,
                      arguments: JSON.stringify(fc.args || {}),
                    },
                    _geminiThoughtSignature: sig,
                  } as ToolCallRequest & { _geminiThoughtSignature?: string });
                }
              }
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit collected tool calls
    for (const tc of pendingToolCalls.values()) {
      onToolCall(tc);
    }
    onFinish?.({ finishReason: "stop" });
  }

  /**
   * Performs a POST request, retrying once without the cache if a request
   * that referenced cached content fails with a stale/expired-cache error.
   */
  private async _request(
    url: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    options: ChatOptions,
  ): Promise<Response> {
    const doPost = async (enableCache: boolean): Promise<{ res: Response; usedCache: boolean }> => {
      const { body, usedCache } = await this._buildBody(
        messages,
        tools,
        model,
        enableCache ? options.enableCache !== false : false,
        options.recacheThreshold,
        options.maxTokens,
        options.reasoningEffort,
      );
      const res = await fetch(url, {
        method: "POST",
        headers: withCustomHeaders(
          {
            "Content-Type": "application/json",
            "x-goog-api-key": options.apiKey,
          },
          options.customHeaders,
          { model, baseUrl: options.baseUrl }
        ),
        body: JSON.stringify(body),
        signal: options.signal,
      });
      return { res, usedCache };
    };

    const first = await doPost(true);
    if (first.res.ok) return first.res;

    const errText = await first.res.text().catch(() => first.res.statusText);

    if (first.usedCache && isStaleCacheError(first.res.status, errText)) {
      debugLog("warn", `Gemini cache stale (${first.res.status}), retrying without cache`);
      this.cache.reset();
      const retry = await doPost(false);
      if (retry.res.ok) return retry.res;
      const retryErrText = await retry.res.text().catch(() => retry.res.statusText);
      throw new Error(`Gemini error ${retry.res.status}: ${retryErrText}`);
    }

    throw new Error(`Gemini error ${first.res.status}: ${errText}`);
  }

  private async _buildBody(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    model: string,
    enableCache: boolean = true,
    recacheThreshold: number = DEFAULT_RECACHE_THRESHOLD,
    maxTokens?: number,
    reasoningEffort?: string,
  ): Promise<{ body: Record<string, unknown>; usedCache: boolean }> {
    const body = buildGeminiBody(messages, tools);

    if (maxTokens && maxTokens > 0) {
      body.generationConfig = { maxOutputTokens: maxTokens };
    }

    // Reasoning effort: Gemini 3 uses a label (thinkingLevel); Gemini 2.5 uses
    // a token budget (thinkingBudget). Send a number as the budget, otherwise
    // pass the label through verbatim.
    if (reasoningEffort) {
      const num = Number(reasoningEffort);
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> | undefined),
        thinkingConfig: Number.isFinite(num)
          ? { thinkingBudget: num }
          : { thinkingLevel: reasoningEffort },
      };
    }

    const systemInstruction = body.systemInstruction as { parts: Array<{ text: string }> } | undefined;
    const contents = (body.contents as GeminiContent[]) || [];
    const currentTokens = estimateTokenCount(contents, systemInstruction, tools);

    // Skip caching if disabled
    if (!enableCache) {
      this.cache.reset();
      return { body, usedCache: false };
    }

    this.cache.setRecacheThreshold(recacheThreshold);

    // A cache that expired/evicted server-side must be recreated from scratch
    if (this.cache.isExpired()) {
      this.cache.invalidate();
    }

    // Only cache once there's enough content (avoid failed create round-trips)
    if (currentTokens < MIN_CACHE_TOKENS) {
      return { body, usedCache: false };
    }

    const toolsForCache = tools.length > 0
      ? [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: sanitizeGeminiSchema(t.parameters) })) }]
      : null;

    // The cachedContents resource bakes in the systemInstruction + tools. If
    // they changed mid-conversation (e.g. the user edited Custom Instructions),
    // the cached content is stale — the cache-use path never resends the system
    // prompt, so the model would keep following the old instructions. Detect the
    // change and invalidate so the cache is recreated with the new prompt.
    const fingerprint = JSON.stringify({ systemInstruction, tools: toolsForCache });
    if (this.cache.getSystemFingerprint() && this.cache.getSystemFingerprint() !== fingerprint) {
      debugLog("info", "Gemini system prompt changed — invalidating cache");
      this.cache.invalidate();
    }

    // New conversation: build the initial cache, send full body while it propagates
    if (this.cache.isNewConversation(messages.length)) {
      await this.cache.createOrUpdateCache(model, systemInstruction || null, contents as any[], toolsForCache, currentTokens);
      return { body, usedCache: false };
    }

    // Context has grown past the rebuild threshold: recreate the cache and send
    // the full body to avoid the propagation race and empty-content requests.
    if (this.cache.shouldRecreateCache(currentTokens)) {
      await this.cache.createOrUpdateCache(model, systemInstruction || null, contents as any[], toolsForCache, currentTokens);
      return { body, usedCache: false };
    }

    // Use cached content + only new messages
    const cacheId = this.cache.getCacheId();
    if (cacheId) {
      const cachedCount = this.cache.getCachedMessageCount();
      const newContents = contents.slice(cachedCount) || [];

      // Safety net: if nothing is new, the cache is stale/ahead of the request
      // (e.g. after an aborted turn). Never send an empty user message — fall
      // back to the full body instead.
      if (newContents.length === 0) {
        this.cache.invalidate();
        return { body, usedCache: false };
      }

      debugLog("info", `Gemini cache used: ${cachedCount} cached, ${newContents.length} new messages`);

      const cachedBody: Record<string, unknown> = {
        cachedContent: cacheId,
        contents: newContents,
      };

      if (body.generationConfig) {
        cachedBody.generationConfig = body.generationConfig;
      }

      return { body: cachedBody, usedCache: true };
    }

    // Fallback: no cache available
    return { body, usedCache: false };
  }
}

// --- Gemini types ---

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thought?: string | { text: string; thought_signature?: string };
  thoughtSignature?: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { role: string; parts: GeminiPart[] };
    finishReason?: string;
  }[];
}

interface GeminiStreamChunk {
  candidates?: {
    content?: { role: string; parts: GeminiPart[] };
  }[];
}

// --- Message conversion ---

/**
 * Rough token estimate (~4 chars per token) used to decide when the cache
 * should be rebuilt. Includes contents, system instruction and tool schemas.
 */
function estimateTokenCount(
  contents: GeminiContent[],
  systemInstruction?: { parts: Array<{ text: string }> } | null,
  tools?: ToolDefinition[],
): number {
  let chars = 0;

  const count = (t: string) => {
    chars += t.length;
  };

  for (const c of contents) {
    for (const p of c.parts) {
      if (typeof p.text === "string") count(p.text);
      if (p.thought) {
        if (typeof p.thought === "string") count(p.thought);
        else count(p.thought.text || "");
      }
      if (p.functionCall) count(JSON.stringify(p.functionCall.args || {}));
      if (p.functionResponse) count(JSON.stringify(p.functionResponse.response || {}));
    }
  }

  if (systemInstruction) {
    for (const p of systemInstruction.parts) count(p.text);
  }

  if (tools) {
    for (const t of tools) {
      count(t.name);
      count(t.description);
      count(JSON.stringify(t.parameters || {}));
    }
  }

  return Math.max(1, Math.ceil(chars / 4));
}

function isStaleCacheError(status: number, text: string): boolean {
  if (status === 404) return true;
  if (status === 400) {
    return /cached content not found|not_found|not found|expired|stale/i.test(text);
  }
  return false;
}

function buildGeminiBody(
  messages: LLMMessage[],
  tools: ToolDefinition[]
): Record<string, unknown> {
  const contents: GeminiContent[] = [];
  let systemInstruction: { parts: Array<{ text: string }> } | null = null;

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = { parts: [{ text: msg.content || "" }] };
      continue;
    }

    if (msg.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: msg.content || "" }],
      });
      continue;
    }

    if (msg.role === "assistant") {
      const parts: GeminiPart[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch { /* empty */ }
          const part: GeminiPart = {
            functionCall: { name: tc.function.name, args },
          };
          const sig = (tc as ToolCallRequest & { _geminiThoughtSignature?: string })._geminiThoughtSignature;
          if (sig) part.thoughtSignature = sig;
          parts.push(part);
        }
      }

      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
      continue;
    }

    if (msg.role === "tool") {
      let response: Record<string, unknown> = {};
      try {
        response = JSON.parse(msg.content || "{}");
      } catch { /* empty */ }

      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name || "",
              response,
            },
          },
        ],
      });
    }
  }

  const body: Record<string, unknown> = { contents };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  if (tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: sanitizeGeminiSchema(t.parameters),
        })),
      },
    ];
  }

  return body;
}

/**
 * Gemini's FunctionDeclaration schema only accepts a single-string `type`
 * (the proto field is an enum, not a list) and requires `type: "array"`
 * schemas to declare their `items` field, recursively. JSON-Schema constructs
 * like union types (`type: ["string", "number"]`) or nested arrays without
 * inner items serialize to invalid protos and get rejected with HTTP 400.
 * Collapse arrays to the first non-null type (marking the field nullable when
 * "null" was present), inject missing `items` for array schemas, and recurse
 * into nested `properties` / `items`. Any other construct passes through
 * unchanged.
 */
function sanitizeGeminiSchema(schema: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!schema || typeof schema !== "object") return schema;

  if (Array.isArray(schema.type)) {
    const types = schema.type as string[];
    const nullable = types.includes("null");
    const nonNull = types.filter((t) => t !== "null");
    const rest: Record<string, any> = { ...schema };
    delete rest.type;
    if (nonNull.length > 0) rest.type = nonNull[0];
    if (nullable) rest.nullable = true;
    return sanitizeGeminiSchema(rest);
  }

  if (schema.type === "array" && !schema.items) {
    return { ...schema, items: {} };
  }

  if (schema.properties && typeof schema.properties === "object") {
    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      properties[key] = sanitizeGeminiSchema(value as Record<string, any>);
    }
    return { ...schema, properties };
  }

  if (schema.items && typeof schema.items === "object") {
    return { ...schema, items: sanitizeGeminiSchema(schema.items as Record<string, any>) };
  }

  return schema;
}

// --- Response parsing ---

function parseGeminiResponse(data: GeminiResponse): ChatResponse {
  const candidate = data.candidates?.[0];
  const content = candidate?.content;
  const parts = content?.parts || [];

  const textParts: string[] = [];
  const toolCalls: ToolCallRequest[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.text) textParts.push(part.text);
    if (part.functionCall) {
      const tc: ToolCallRequest & { _geminiThoughtSignature?: string } = {
        id: `gemini_call_${i}`,
        type: "function",
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        },
      };
      if (part.thoughtSignature) {
        tc._geminiThoughtSignature = part.thoughtSignature;
      }
      toolCalls.push(tc);
    }
  }

  return {
    id: `gemini_${Date.now()}`,
    content: textParts.join("") || null,
    toolCalls,
    finishReason: candidate?.finishReason === "STOP" ? "stop" : "tool_calls",
  };
}
