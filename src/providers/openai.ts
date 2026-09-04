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
import { withCustomHeaders } from "../lib/customHeaders";

/** Responses API minimum for max_output_tokens (enforced by OpenAI). */
const MIN_RESPONSES_OUTPUT_TOKENS = 16;

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly requiresKey: boolean,
    public readonly defaultModel: string
  ) {}

  async listModels(
    apiKey: string,
    baseUrl?: string,
    proxyRequests?: boolean
  ): Promise<ModelInfo[]> {
    const url = buildRequestUrl(
      baseUrl ?? "https://api.openai.com/v1",
      "/models",
      proxyRequests
    );
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to list models: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { data: { id: string }[] };
    return data.data.map((m) => ({ id: m.id, name: m.id }));
  }

  flushCache(): void {
    // OpenAI/OpenRouter/OpenCode cache automatically; nothing to flush.
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    if (options.useLegacyChatCompletions) {
      return this._chatLegacy(messages, tools, options);
    }
    return this._chatResponses(messages, tools, options);
  }

  private async _chatLegacy(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    const url = buildRequestUrl(
      options.baseUrl ?? "https://api.openai.com/v1",
      "/chat/completions",
      options.proxyRequests
    );

    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map((m) => serializeOutbound(m, options)),
      max_completion_tokens: options.maxTokens ?? 4096,
    };

    if (tools.length > 0) {
      body.tools = tools.map(serializeTool);
    }

    if (options.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: withCustomHeaders(
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        options.customHeaders,
        { model: options.model, baseUrl: options.baseUrl }
      ),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Provider error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const parsed = parseChatResponse(data);
    logUsage(parsed.usage);
    return parsed;
  }

  private async _chatResponses(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    const url = buildRequestUrl(
      options.baseUrl ?? "https://api.openai.com/v1",
      "/responses",
      options.proxyRequests
    );

    const body: Record<string, unknown> = {
      model: options.model,
      input: serializeResponsesInput(messages),
      max_output_tokens: Math.max(options.maxTokens ?? 4096, MIN_RESPONSES_OUTPUT_TOKENS),
    };

    const instructions = extractResponsesInstructions(messages);
    if (instructions) {
      body.instructions = instructions;
    }

    if (tools.length > 0) {
      body.tools = tools.map(serializeResponsesTool);
      body.tool_choice = "auto";
    }

    if (options.reasoningEffort) {
      body.reasoning = { effort: options.reasoningEffort };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: withCustomHeaders(
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        options.customHeaders,
        { model: options.model, baseUrl: options.baseUrl }
      ),
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Provider error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const parsed = parseResponsesResponse(data);
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
    if (options.useLegacyChatCompletions) {
      return this._chatStreamLegacy(
        messages, onToken, onToolCall, tools, options, onReasoningToken, onFinish
      );
    }
    return this._chatStreamResponses(
      messages, onToken, onToolCall, tools, options, onReasoningToken, onFinish
    );
  }

  private async _chatStreamLegacy(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: ToolCallRequest) => void,
    tools: ToolDefinition[],
    options: ChatOptions,
    onReasoningToken?: (token: string) => void,
    onFinish?: (info: { finishReason: "stop" | "length" | "error" }) => void
  ): Promise<void> {
    const url = buildRequestUrl(
      options.baseUrl ?? "https://api.openai.com/v1",
      "/chat/completions",
      options.proxyRequests
    );

    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map((m) => serializeOutbound(m, options)),
      stream: true,
      max_completion_tokens: options.maxTokens ?? 4096,
      stream_options: { include_usage: true },
    };

    if (tools.length > 0) {
      body.tools = tools.map(serializeTool);
    }

    if (options.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    const pendingToolCalls = new Map<number, ToolCallRequest>();
    let streamUsage: CacheUsage | undefined;
    let finishReasonLegacy: "stop" | "length" | "error" = "stop";

    return new Promise((resolve, reject) => {
      fetchSSE(
        url,
        body,
        withCustomHeaders(
          { Authorization: `Bearer ${options.apiKey}` },
          options.customHeaders,
          { model: options.model, baseUrl: options.baseUrl }
        ),
        (chunk) => {
          const usage = chunk.usage as Usage | undefined;
          if (usage && typeof usage.prompt_tokens === "number") {
            streamUsage = {
              promptTokens: usage.prompt_tokens,
              cachedTokens: usage.prompt_tokens_details?.cached_tokens,
              cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens,
            };
          }

          const choices = chunk.choices as
            | { delta: Record<string, unknown>; finish_reason?: string }[]
            | undefined;
          if (!choices) return;

          for (const choice of choices) {
            const delta = choice.delta;
            if (!delta) continue;

            if (onReasoningToken && "reasoning_content" in delta) {
              // DeepSeek thinking mode may emit an empty reasoning_content on
              // tool-call turns; it is still meaningful and must be echoed.
              onReasoningToken(delta.reasoning_content as string);
            }

            if (delta.content) {
              onToken(delta.content as string);
            }

            if (delta.tool_calls) {
              const calls = delta.tool_calls as Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
              for (const tc of calls) {
                const idx = tc.index;
                if (!pendingToolCalls.has(idx)) {
                  pendingToolCalls.set(idx, {
                    id: tc.id ?? "",
                    type: "function",
                    function: { name: "", arguments: "" },
                  });
                }
                const existing = pendingToolCalls.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name = tc.function.name;
                if (tc.function?.arguments)
                  existing.function.arguments += tc.function.arguments;
              }
            }

            if (choice.finish_reason === "tool_calls") {
              for (const tc of pendingToolCalls.values()) {
                onToolCall(tc);
              }
            }
            if (choice.finish_reason === "length") {
              finishReasonLegacy = "length";
            }
            if (choice.finish_reason === "stop" && finishReasonLegacy !== "length") {
              finishReasonLegacy = "stop";
            }
          }
        },
        () => {
          logUsage(streamUsage);
          onFinish?.({ finishReason: finishReasonLegacy });
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

  private async _chatStreamResponses(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: ToolCallRequest) => void,
    tools: ToolDefinition[],
    options: ChatOptions,
    onReasoningToken?: (token: string) => void,
    onFinish?: (info: { finishReason: "stop" | "length" | "error" }) => void
  ): Promise<void> {
    const url = buildRequestUrl(
      options.baseUrl ?? "https://api.openai.com/v1",
      "/responses",
      options.proxyRequests
    );

    const body: Record<string, unknown> = {
      model: options.model,
      input: serializeResponsesInput(messages),
      stream: true,
      max_output_tokens: Math.max(options.maxTokens ?? 4096, MIN_RESPONSES_OUTPUT_TOKENS),
    };

    const instructions = extractResponsesInstructions(messages);
    if (instructions) {
      body.instructions = instructions;
    }

    if (tools.length > 0) {
      body.tools = tools.map(serializeResponsesTool);
      body.tool_choice = "auto";
    }

    if (options.reasoningEffort) {
      body.reasoning = { effort: options.reasoningEffort };
    }

    const pendingToolCalls = new Map<number, ToolCallRequest>();
    let streamUsage: CacheUsage | undefined;
    let finishReason: "stop" | "length" | "error" = "stop";
    let streamError: Error | null = null;

    return new Promise((resolve, reject) => {
      fetchSSE(
        url,
        body,
        withCustomHeaders(
          { Authorization: `Bearer ${options.apiKey}` },
          options.customHeaders,
          { model: options.model, baseUrl: options.baseUrl }
        ),
        (chunk) => {
          const type = chunk.type as string;

          switch (type) {
            case "response.output_item.added": {
              const item = chunk.item as
                | { type: string; call_id?: string; id?: string; name?: string }
                | undefined;
              if (item?.type === "function_call") {
                const idx = (chunk.output_index as number) ?? pendingToolCalls.size;
                pendingToolCalls.set(idx, {
                  id: item.call_id || item.id || "",
                  type: "function",
                  function: { name: item.name || "", arguments: "" },
                });
              }
              break;
            }
            case "response.function_call_arguments.delta": {
              const idx = chunk.output_index as number;
              const delta = chunk.delta as string | undefined;
              const existing = pendingToolCalls.get(idx);
              if (existing && delta) {
                existing.function.arguments += delta;
              }
              break;
            }
            case "response.function_call_arguments.done": {
              const idx = chunk.output_index as number;
              const args = chunk.arguments as string | undefined;
              const existing = pendingToolCalls.get(idx);
              if (existing && args !== undefined) {
                existing.function.arguments = args;
              }
              break;
            }
            case "response.output_item.done": {
              const item = chunk.item as
                | { type: string; call_id?: string; id?: string; name?: string; arguments?: string }
                | undefined;
              if (item?.type === "function_call") {
                const existing = pendingToolCalls.get(chunk.output_index as number);
                const tc: ToolCallRequest = existing ?? {
                  id: item.call_id || item.id || "",
                  type: "function",
                  function: { name: item.name || "", arguments: "" },
                };
                if (item.arguments !== undefined) {
                  tc.function.arguments = item.arguments;
                }
                onToolCall(tc);
              }
              break;
            }
            case "response.output_text.delta": {
              const delta = chunk.delta as string | undefined;
              if (delta) onToken(delta);
              break;
            }
            case "response.reasoning_summary_text.delta":
            case "response.reasoning_text.delta": {
              // Zen Go streams reasoning as response.reasoning_text.delta; other
              // OpenAI-compatible endpoints may send the summary variant instead.
              // Handle both so reasoning is never silently dropped.
              const delta = chunk.delta as string | undefined;
              if (delta && onReasoningToken) onReasoningToken(delta);
              break;
            }
            case "response.completed": {
              const resp = chunk.response as
                | {
                    status?: string;
                    incomplete_details?: { reason?: string };
                    usage?: unknown;
                    error?: { message?: string };
                  }
                | undefined;
              if (resp?.status === "failed" || resp?.error) {
                streamError = new Error(
                  resp?.error?.message || "The provider reported that the response failed."
                );
                finishReason = "error";
              } else if (
                resp?.incomplete_details?.reason === "max_output_tokens" ||
                resp?.incomplete_details?.reason === "max_tokens"
              ) {
                finishReason = "length";
              }
              const usage = resp?.usage as
                | { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; cache_write_input_tokens?: number }
                | undefined;
              if (usage && typeof usage.input_tokens === "number") {
                streamUsage = {
                  promptTokens: usage.input_tokens,
                  cachedTokens: usage.input_tokens_details?.cached_tokens,
                  cacheWriteTokens: usage.cache_write_input_tokens,
                };
              }
              break;
            }
            case "error": {
              const err = chunk as { message?: string; code?: string };
              streamError = new Error(err.message || `Provider stream error${err.code ? ` (${err.code})` : ""}`);
              finishReason = "error";
              break;
            }
            case "response.failed": {
              const err = chunk as { response?: { error?: { message?: string } } };
              streamError = new Error(
                err.response?.error?.message || "The provider reported that the response failed."
              );
              finishReason = "error";
              break;
            }
            default:
              break;
          }
        },
        () => {
          logUsage(streamUsage);
          if (streamError) {
            reject(streamError);
            return;
          }
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
}

function serializeOutbound(
  msg: LLMMessage,
  options: Pick<ChatOptions, "echoReasoningContent">
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.tool_call_id) {
    out.tool_call_id = msg.tool_call_id;
  }
  if (msg.name) {
    out.name = msg.name;
  }
  if (msg.tool_calls) {
    out.tool_calls = msg.tool_calls.map((tc) => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }

  // DeepSeek thinking mode requires `reasoning_content` on every assistant
  // message once the request carries `tools`; echo verbatim (or `""` when a
  // message predates reasoning capture, e.g. a provider switch mid-session).
  if (options.echoReasoningContent && msg.role === "assistant") {
    out.reasoning_content = msg.reasoningContent ?? "";
  } else if (msg.reasoningContent !== undefined) {
    out.reasoning_content = msg.reasoningContent;
  }

  return out;
}

/**
 * Convert internal messages to the Responses API `input` item format.
 * System messages become no item (the first is hoisted to `instructions`
 * by the caller's body builder via buildResponsesBody).
 */
function extractResponsesInstructions(messages: LLMMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content || "")
    .join("\n\n");
}

function serializeResponsesInput(messages: LLMMessage[]): unknown[] {
  const items: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      items.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: msg.content || "" }],
      });
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.content) {
        items.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: msg.content }],
        });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          items.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      }
      continue;
    }

    if (msg.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: msg.tool_call_id || "",
        output: msg.content || "",
      });
      continue;
    }
  }

  return items;
}

function serializeResponsesTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  cache_write_input_tokens?: number;
}

function parseResponsesResponse(data: Record<string, unknown>): ChatResponse {
  const output = (data.output as Record<string, unknown>[]) ?? [];

  let content = "";
  const toolCalls: ToolCallRequest[] = [];

  for (const item of output) {
    if (item.type === "message") {
      const parts = (item.content as { type?: string; text?: string }[]) ?? [];
      for (const part of parts) {
        if (part.type === "output_text" && part.text) {
          content += part.text;
        }
      }
    } else if (item.type === "function_call") {
      const tc = item as {
        call_id?: string;
        id?: string;
        name?: string;
        arguments?: string;
      };
      toolCalls.push({
        id: tc.call_id || tc.id || "",
        type: "function",
        function: {
          name: tc.name || "",
          arguments: tc.arguments || "",
        },
      });
    }
  }

  const usage = data.usage as ResponsesUsage | undefined;

  let finishReason: ChatResponse["finishReason"] = "stop";
  if (toolCalls.length > 0) {
    finishReason = "tool_calls";
  } else if ((data.status as string) === "incomplete") {
    finishReason = "length";
  }

  return {
    id: data.id as string,
    content: content || null,
    toolCalls,
    finishReason,
    usage: usage
      ? {
          promptTokens: usage.input_tokens ?? 0,
          completionTokens: usage.output_tokens ?? 0,
          cachedTokens: usage.input_tokens_details?.cached_tokens,
          cacheWriteTokens: usage.cache_write_input_tokens,
        }
      : undefined,
  };
}

function serializeTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
}

interface CacheUsage {
  promptTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

function logUsage(usage: CacheUsage | undefined): void {
  if (!usage) return;
  const cached = usage.cachedTokens ?? 0;
  const written = usage.cacheWriteTokens ?? 0;
  debugLog("info", `OpenAI cache: ${cached} cached / ${written} written / ${usage.promptTokens} input`);
}

function parseChatResponse(data: Record<string, unknown>): ChatResponse {
  const choice = ((data.choices as Record<string, unknown>[])?.[0]) ?? {};
  const message = choice.message as Record<string, unknown> | undefined;

  const usage = data.usage as Usage | undefined;

  return {
    id: data.id as string,
    content: (message?.content as string) ?? null,
    toolCalls:
      ((message?.tool_calls as ToolCallRequest[]) ?? []).map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    finishReason: (choice.finish_reason as ChatResponse["finishReason"]) ?? "stop",
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens,
          cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens,
        }
      : undefined,
  };
}
