import type {
  LLMProvider,
  LLMMessage,
  ToolCallRequest,
  ToolDefinition,
  ChatOptions,
  ChatResponse,
  ModelInfo,
} from "./types";
import { debugLog } from "../lib/debugLog";
import { buildRequestUrl } from "./proxyUrl";
import { withCustomHeaders } from "../lib/customHeaders";
import { proxyFetch } from "../lib/sessionAuth";
import {
  discoverBedrockModels,
  getBedrockCapabilities,
  runtimeBaseUrl,
  DEFAULT_BEDROCK_REGION,
  type BedrockCapabilities,
} from "../lib/bedrockModels";
import { AwsEventStreamDecoder } from "./awsEventStream";

const DEFAULT_MODEL = "nvidia.nemotron-super-3-120b";

function regionOf(options: ChatOptions): string {
  return options.region || DEFAULT_BEDROCK_REGION;
}

function buildHeaders(options: ChatOptions): Record<string, string> {
  return withCustomHeaders(
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    options.customHeaders,
    { model: options.model, baseUrl: options.baseUrl }
  );
}

function bedrockError(status: number, text: string, region: string): Error {
  let message = text;
  try {
    const parsed = JSON.parse(text) as { message?: string; Message?: string };
    message = parsed.message || parsed.Message || text;
  } catch {
    /* keep raw text */
  }
  if (status === 403 && /being verified/i.test(message)) {
    return new Error(
      `Amazon Bedrock: your AWS account is still being verified. Inference is ` +
        `unavailable until verification completes (usually under 2 hours). ${message}`
    );
  }
  if (status === 403) {
    return new Error(
      `Amazon Bedrock error 403 (access denied). Check that model access is ` +
        `enabled in ${region} for this model, and that the API key has ` +
        `bedrock:InvokeModel / bedrock:InvokeModelWithResponseStream. ${message}`
    );
  }
  if (status === 404) {
    return new Error(
      `Amazon Bedrock error 404: model not found or not available in ${region}. ${message}`
    );
  }
  return new Error(`Amazon Bedrock error ${status}: ${message}`);
}

interface ConverseContentBlock {
  text?: string;
  toolUse?: { toolUseId?: string; name?: string; input?: Record<string, unknown> };
  reasoningContent?: { reasoningText?: { text?: string } };
}

interface ConverseResponse {
  output?: { message?: { role?: string; content?: ConverseContentBlock[] } };
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  };
}

function mapStopReason(
  reason: string | undefined
): ChatResponse["finishReason"] {
  switch (reason) {
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    case "guardrail_intervened":
    case "content_filtered":
      return "error";
    default:
      return "stop";
  }
}

export class BedrockProvider implements LLMProvider {
  constructor(
    public readonly id: string = "bedrock",
    public readonly label: string = "Amazon Bedrock",
    public readonly requiresKey: boolean = true,
    public readonly defaultModel: string = DEFAULT_MODEL
  ) {}

  async listModels(
    apiKey: string,
    _baseUrl?: string,
    proxyRequests?: boolean,
    region?: string
  ): Promise<ModelInfo[]> {
    return discoverBedrockModels({
      apiKey,
      region: region || DEFAULT_BEDROCK_REGION,
      proxyRequests,
    });
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse> {
    const region = regionOf(options);
    const url = buildRequestUrl(
      runtimeBaseUrl(region),
      `/model/${options.model}/converse`,
      options.proxyRequests
    );

    const res = await proxyFetch(url, {
      method: "POST",
      headers: buildHeaders(options),
      body: JSON.stringify(
        buildConverseBody(messages, tools, options, getBedrockCapabilities(options.model))
      ),
      signal: options.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw bedrockError(res.status, text, region);
    }

    const data = (await res.json()) as ConverseResponse;
    return parseConverseResponse(data);
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
    const region = regionOf(options);
    const url = buildRequestUrl(
      runtimeBaseUrl(region),
      `/model/${options.model}/converse-stream`,
      options.proxyRequests
    );

    const res = await proxyFetch(url, {
      method: "POST",
      headers: buildHeaders(options),
      body: JSON.stringify(
        buildConverseBody(messages, tools, options, getBedrockCapabilities(options.model))
      ),
      signal: options.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      const err = bedrockError(res.status, text, region);
      onFinish?.({ finishReason: "error" });
      throw err;
    }
    if (!res.body) {
      onFinish?.({ finishReason: "error" });
      throw new Error("Amazon Bedrock: response body is not streamable.");
    }

    const decoder = new AwsEventStreamDecoder();
    const reader = res.body.getReader();
    const textDecoder = new TextDecoder();
    const pending = new Map<
      number,
      { toolUseId: string; name: string; arguments: string }
    >();
    let streamUsage: ConverseResponse["usage"];
    let finishReason: "stop" | "length" | "error" = "stop";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of decoder.push(value)) {
          const payloadText = textDecoder.decode(frame.payload);
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payloadText) as Record<string, unknown>;
          } catch {
            continue;
          }

          const exceptionType = firstExceptionKey(event);
          if (
            frame.headers[":message-type"] === "exception" ||
            exceptionType
          ) {
            const key =
              frame.headers[":exception-type"] || exceptionType || "exception";
            const detail = event[key] as { message?: string } | undefined;
            const message =
              detail?.message ||
              (event.message as string | undefined) ||
              payloadText;
            throw new Error(`Amazon Bedrock stream error (${key}): ${message}`);
          }

          // The event type lives in the `:event-type` header; the payload is the
          // bare event body (e.g. `{"contentBlockIndex":0,"delta":{...}}`).
          switch (frame.headers[":event-type"]) {
            case "contentBlockStart": {
              const index = event.contentBlockIndex;
              const tu = (
                event.start as
                  | { toolUse?: { toolUseId?: string; name?: string } }
                  | undefined
              )?.toolUse;
              if (typeof index === "number" && tu) {
                pending.set(index, {
                  toolUseId: tu.toolUseId || "",
                  name: tu.name || "",
                  arguments: "",
                });
              }
              break;
            }

            case "contentBlockDelta": {
              const index = event.contentBlockIndex;
              const delta = event.delta as
                | {
                    text?: string;
                    toolUse?: { input?: string };
                    reasoningContent?: { text?: string };
                  }
                | undefined;
              if (typeof index !== "number" || !delta) break;
              if (delta.text) onToken(delta.text);
              if (delta.toolUse?.input) {
                const p = pending.get(index);
                if (p) p.arguments += delta.toolUse.input;
              }
              if (delta.reasoningContent?.text && onReasoningToken) {
                onReasoningToken(delta.reasoningContent.text);
              }
              break;
            }

            case "contentBlockStop": {
              const index = event.contentBlockIndex;
              if (typeof index !== "number") break;
              const p = pending.get(index);
              if (p) {
                onToolCall({
                  id: p.toolUseId,
                  type: "function",
                  function: { name: p.name, arguments: p.arguments || "{}" },
                });
                pending.delete(index);
              }
              break;
            }

            case "messageStop": {
              finishReason = mapStreamStopReason(
                event.stopReason as string | undefined
              );
              break;
            }

            case "metadata": {
              streamUsage = event.usage as ConverseResponse["usage"];
              break;
            }

            default:
              break;
          }
        }
      }
    } catch (err) {
      await reader.cancel().catch(() => {});
      logUsage(streamUsage);
      onFinish?.({ finishReason: "error" });
      throw err;
    }

    logUsage(streamUsage);
    onFinish?.({ finishReason });
  }
}

function firstExceptionKey(event: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(event)) {
    if (/Exception$/.test(key)) return key;
  }
  return undefined;
}

function mapStreamStopReason(
  reason: string | undefined
): "stop" | "length" | "error" {
  if (reason === "max_tokens") return "length";
  if (reason === "guardrail_intervened" || reason === "content_filtered") {
    return "error";
  }
  return "stop";
}

interface ConverseMessage {
  role: "user" | "assistant";
  content: Record<string, unknown>[];
}

export function buildConverseBody(
  messages: LLMMessage[],
  tools: ToolDefinition[],
  options: ChatOptions,
  capabilities?: BedrockCapabilities
): Record<string, unknown> {
  // Explicit prompt caching is only safe for models that advertise support;
  // sending a cachePoint to any other model fails the request. A checkpoint
  // inside `toolConfig.tools` is additionally rejected by some caching-capable
  // models (e.g. Nova), so it is gated on a separate capability.
  const useCache =
    options.enableCache !== false &&
    capabilities?.explicitPromptCaching === true;
  const useToolCache = useCache && capabilities?.toolCachePoint === true;
  const cachePoint = () => ({ cachePoint: { type: "default" } });

  const system: Record<string, unknown>[] = [];
  const out: ConverseMessage[] = [];

  const pushUserBlock = (block: Record<string, unknown>) => {
    const last = out[out.length - 1];
    if (last && last.role === "user") {
      last.content.push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  };

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content) system.push({ text: msg.content });
      continue;
    }

    if (msg.role === "user") {
      pushUserBlock({ text: msg.content || "" });
      continue;
    }

    if (msg.role === "tool") {
      pushUserBlock({
        toolResult: {
          toolUseId: msg.tool_call_id || "",
          content: [{ text: msg.content || "" }],
          status: "success",
        },
      });
      continue;
    }

    // assistant
    const content: Record<string, unknown>[] = [];
    if (msg.content) content.push({ text: msg.content });
    for (const tc of msg.tool_calls || []) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* tolerate malformed arguments */
      }
      content.push({
        toolUse: { toolUseId: tc.id, name: tc.function.name, input },
      });
    }
    if (content.length > 0) {
      out.push({ role: "assistant", content });
    }
  }

  const body: Record<string, unknown> = { messages: out };
  if (system.length > 0) {
    if (useCache) system.push(cachePoint());
    body.system = system;
  }

  if (tools.length > 0) {
    const toolList: Record<string, unknown>[] = tools.map((t) => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: t.parameters },
      },
    }));
    if (useToolCache) toolList.push(cachePoint());
    body.toolConfig = { tools: toolList };
  }

  // Cache the whole conversation prefix by checkpointing the newest turn. The
  // prefix is stable across requests, so later turns get cache reads. A
  // checkpoint is only valid in a user message; our bodies always end with one.
  if (useCache) {
    const last = out[out.length - 1];
    if (last && last.role === "user") last.content.push(cachePoint());
  }

  if (options.maxTokens) {
    body.inferenceConfig = { maxTokens: options.maxTokens };
  }

  return body;
}

export function parseConverseResponse(data: ConverseResponse): ChatResponse {
  const blocks = data.output?.message?.content || [];
  let content = "";
  const toolCalls: ToolCallRequest[] = [];

  for (const block of blocks) {
    if (block.text) {
      content += block.text;
    } else if (block.toolUse) {
      toolCalls.push({
        id: block.toolUse.toolUseId || `bedrock_call_${toolCalls.length}`,
        type: "function",
        function: {
          name: block.toolUse.name || "",
          arguments: JSON.stringify(block.toolUse.input ?? {}),
        },
      });
    }
  }

  const usage = data.usage;
  return {
    id: `bedrock_${Date.now()}`,
    content: content || null,
    toolCalls,
    finishReason: mapStopReason(data.stopReason),
    usage: usage
      ? {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          cachedTokens: usage.cacheReadInputTokens,
          cacheWriteTokens: usage.cacheWriteInputTokens,
        }
      : undefined,
  };
}

function logUsage(usage: ConverseResponse["usage"]): void {
  if (!usage) return;
  debugLog(
    "info",
    `Bedrock usage: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out` +
      (usage.cacheReadInputTokens
        ? ` / ${usage.cacheReadInputTokens} cached`
        : "")
  );
}
