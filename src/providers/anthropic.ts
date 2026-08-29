import type {
  LLMProvider,
  LLMMessage,
  ToolCallRequest,
  ToolDefinition,
  ChatOptions,
  ChatResponse,
  ModelInfo,
} from "./types";
import { fetchSSE } from "../lib/fetchSSE";
import { debugLog } from "../lib/debugLog";
import { buildRequestUrl } from "./proxyUrl";

const DEFAULT_BASE = "https://api.anthropic.com/v1";

/**
 * Anthropic blocks browser-origin requests (Word taskpane / dev browser)
 * unless this header is present. Without it the API returns a CORS error.
 */
const BROWSER_ACCESS_HEADER = "anthropic-dangerous-direct-browser-access";

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    [BROWSER_ACCESS_HEADER]: "true",
  };
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: AnthropicUsage;
}

export class AnthropicProvider implements LLMProvider {
  constructor(
    public readonly id: string = "anthropic",
    public readonly label: string = "Anthropic Claude",
    public readonly requiresKey: boolean = true,
    public readonly defaultModel: string = "claude-haiku-4-5"
  ) {}

  async listModels(
    apiKey: string,
    baseUrl?: string,
    proxyRequests?: boolean
  ): Promise<ModelInfo[]> {
    const url = buildRequestUrl(baseUrl || DEFAULT_BASE, "/models", proxyRequests);

    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        [BROWSER_ACCESS_HEADER]: "true",
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data || []).map((m) => ({ id: m.id, name: m.id }));
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    const url = buildRequestUrl(
      options.baseUrl || DEFAULT_BASE,
      "/messages",
      options.proxyRequests
    );
    const body = this._buildBody(messages, tools, options, false);

    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(options.apiKey),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Anthropic error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const parsed = parseAnthropicResponse(data);
    logUsage(parsed.usage);
    return parsed;
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
    const url = buildRequestUrl(
      options.baseUrl || DEFAULT_BASE,
      "/messages",
      options.proxyRequests
    );
    const body = this._buildBody(messages, tools, options, true);

    const pendingToolCalls = new Map<number, ToolCallRequest>();
    const pendingJson = new Map<number, string>();
    let streamUsage: {
      promptTokens: number;
      completionTokens?: number;
      cachedTokens?: number;
      cacheWriteTokens?: number;
    } | undefined;
    let finishReason: "stop" | "length" | "error" = "stop";

    return new Promise((resolve, reject) => {
      fetchSSE(
        url,
        body,
        buildHeaders(options.apiKey),
        (chunk) => {
          const type = chunk.type as string;

          switch (type) {
            case "message_start": {
              const usage = (chunk.message as { usage?: AnthropicUsage } | undefined)?.usage;
              if (usage && typeof usage.input_tokens === "number") {
                streamUsage = {
                  promptTokens: usage.input_tokens,
                  cachedTokens: usage.cache_read_input_tokens,
                  cacheWriteTokens: usage.cache_creation_input_tokens,
                };
              }
              break;
            }
            case "message_delta": {
              const usage = chunk.usage as AnthropicUsage | undefined;
              if (usage && typeof usage.output_tokens === "number") {
                streamUsage = {
                  promptTokens: streamUsage?.promptTokens ?? 0,
                  cachedTokens: streamUsage?.cachedTokens,
                  cacheWriteTokens: streamUsage?.cacheWriteTokens,
                  completionTokens: usage.output_tokens,
                };
              }
              const delta = chunk.delta as { stop_reason?: string } | undefined;
              if (delta?.stop_reason === "max_tokens") {
                finishReason = "length";
              }
              break;
            }
            case "content_block_start": {
              const block = chunk.content_block as
                | { type?: string; id?: string; name?: string }
                | undefined;
              const idx = chunk.index as number;
              if (block?.type === "tool_use") {
                pendingToolCalls.set(idx, {
                  id: block.id || "",
                  type: "function",
                  function: { name: block.name || "", arguments: "" },
                });
                pendingJson.set(idx, "");
              }
              break;
            }
            case "content_block_delta": {
              const idx = chunk.index as number;
              const delta = chunk.delta as
                | { type?: string; text?: string; partial_json?: string; thinking?: string }
                | undefined;
              if (!delta) break;

              if (delta.type === "text_delta" && delta.text) {
                onToken(delta.text);
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                const existing = pendingJson.get(idx) ?? "";
                pendingJson.set(idx, existing + delta.partial_json);
              } else if (delta.type === "thinking_delta" && delta.thinking && onReasoningToken) {
                onReasoningToken(delta.thinking);
              }
              break;
            }
            case "content_block_stop": {
              const idx = chunk.index as number;
              const tc = pendingToolCalls.get(idx);
              if (tc) {
                tc.function.arguments = pendingJson.get(idx) ?? "";
                onToolCall(tc);
                pendingToolCalls.delete(idx);
                pendingJson.delete(idx);
              }
              break;
            }
            default:
              break;
          }
        },
        () => {
          logUsage(streamUsage);
          onFinish?.({ finishReason });
          resolve();
        },
        (err) => {
          onFinish?.({ finishReason: "error" });
          reject(err);
        },
        options.signal
      );
    });
  }

  private _buildBody(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
    };

    if (stream) {
      body.stream = true;
    }

    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content || "")
      .join("\n\n");
    if (system) {
      body.system = system;
    }

    if (tools.length > 0) {
      body.tools = tools.map(serializeTool);
      body.tool_choice = { type: "auto" };
    }

    // Reasoning effort (free-form label, passed verbatim). Only supported by
    // adaptive-thinking models; unsupported models will reject the request.
    if (options.reasoningEffort) {
      body.output_config = { effort: options.reasoningEffort };
    }

    // Automatic caching: single top-level cache_control. The platform applies
    // the breakpoint to the last cacheable block and moves it forward as the
    // conversation grows. Default TTL is 5 minutes; "1h" survives longer gaps
    // between requests at a higher cache-write price.
    if (options.enableCache !== false) {
      body.cache_control =
        options.cacheTtl === "1h"
          ? { type: "ephemeral", ttl: "1h" }
          : { type: "ephemeral" };
    }

    body.messages = serializeAnthropicMessages(messages);

    return body;
  }
}

function serializeTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

/**
 * Convert internal messages to the Anthropic Messages format:
 * - system  -> hoisted to the top-level `system` field (handled by caller)
 * - user    -> { role: "user", content: string }
 * - assistant -> content array of text + tool_use blocks
 * - tool    -> merged into a single user message with tool_result blocks
 *   (Anthropic has no "tool" role; results live in user messages)
 */
export function serializeAnthropicMessages(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content || "" });
      continue;
    }

    if (msg.role === "assistant") {
      const blocks: unknown[] = [];
      if (msg.content) {
        blocks.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.tool_calls || []) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch { /* empty */ }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    if (msg.role === "tool") {
      // Merge consecutive tool results into one user message.
      const last = out[out.length - 1] as
        | { role?: string; content?: unknown[] }
        | undefined;
      const block = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id || "",
        content: msg.content || "",
      };
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
  }

  return out;
}

function parseAnthropicResponse(data: AnthropicResponse): ChatResponse {
  const blocks = data.content || [];

  let content = "";
  const toolCalls: ToolCallRequest[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "text" && block.text) {
      content += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id || `anthropic_call_${i}`,
        type: "function",
        function: {
          name: block.name || "",
          arguments: JSON.stringify(block.input || {}),
        },
      });
    }
  }

  const usage = data.usage;
  let finishReason: ChatResponse["finishReason"] = "stop";
  if (data.stop_reason === "tool_use") {
    finishReason = "tool_calls";
  } else if (data.stop_reason === "max_tokens") {
    finishReason = "length";
  }

  return {
    id: data.id || `anthropic_${Date.now()}`,
    content: content || null,
    toolCalls,
    finishReason,
    usage: usage
      ? {
          promptTokens: usage.input_tokens ?? 0,
          completionTokens: usage.output_tokens ?? 0,
          cachedTokens: usage.cache_read_input_tokens,
          cacheWriteTokens: usage.cache_creation_input_tokens,
        }
      : undefined,
  };
}

function logUsage(usage: {
  promptTokens: number;
  completionTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
} | undefined): void {
  if (!usage) return;
  const cached = usage.cachedTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  debugLog("info", `Anthropic cache: ${cached} read / ${written} written / ${usage.promptTokens} input`);
}
