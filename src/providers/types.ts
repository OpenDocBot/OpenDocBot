export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCallRequest[];
  /**
   * Chain-of-thought captured from an assistant turn (OpenAI-compatible
   * `reasoning_content`). Providers with thinking mode (DeepSeek) require it
   * to be echoed back verbatim on every assistant message in subsequent
   * requests, so this field is stored on history messages and re-serialized.
   */
  reasoningContent?: string;
}

export interface ToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /**
   * Which Office host(s) this tool applies to. Omitted or "both" → available
   * in every host. "word" → only Word, "excel" → only Excel,
   * "powerpoint" → only PowerPoint.
   */
  host?: "word" | "excel" | "powerpoint" | "both";
  /**
   * Tool that only exists in suggestion (read-only review) mode. Hidden by
   * default; shown only when the mode is on.
   */
  suggestionOnly?: boolean;
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ChatResponse {
  id: string;
  content: string | null;
  toolCalls: ToolCallRequest[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
  };
}

export interface ChatOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  enableCache?: boolean;
  recacheThreshold?: number;
  /**
   * Force the legacy `/chat/completions` endpoint instead of the Responses
   * API (`/responses`). Defaults to false; some OpenAI-compatible endpoints
   * (e.g. Ollama, DeepSeek/OpenCode) only support chat completions.
   */
  useLegacyChatCompletions?: boolean;
  /**
   * Free-form reasoning-effort label (e.g. "low", "medium", "high", "xhigh",
   * "max"). Sent verbatim to the provider's reasoning/effort field when set;
   * omitted or empty means don't send (use the provider default).
   */
  reasoningEffort?: string;
  /**
   * Route requests through a same-origin `/proxy/<encoded-baseUrl>` endpoint
   * instead of calling the provider directly. Enabled by the "Proxy API
   * requests through this server" checkbox (self-hosted / dev deployments).
   * The serving process must implement the proxy route (see scripts/proxy.mjs).
   */
  proxyRequests?: boolean;
  /**
   * Anthropic prompt-cache TTL. "5m" (default) refreshes for free within
   * bursts; "1h" costs 2x on cache writes but survives longer pauses.
   */
  cacheTtl?: "5m" | "1h";
  /**
   * Raw custom headers (the Custom preset). Values may contain `$VAR` tokens
   * which are resolved at request time (see src/lib/customHeaders.ts). Sent
   * on top of the provider's own headers, which always take precedence.
   */
  customHeaders?: Record<string, string>;
  /**
   * Echo `reasoning_content` on every assistant message (empty string when no
   * reasoning was captured). Required by DeepSeek thinking mode: once the
   * conversation carries the `tools` parameter, ALL assistant messages must
   * include the field or the API returns 400. Enabled for the DeepSeek preset.
   */
  echoReasoningContent?: boolean;
}

export interface LLMProvider {
  readonly id: string;
  readonly label: string;
  readonly requiresKey: boolean;
  readonly defaultModel: string;

  listModels(
    apiKey: string,
    baseUrl?: string,
    proxyRequests?: boolean
  ): Promise<ModelInfo[]>;
  chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ): Promise<ChatResponse>;
  chatStream(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: ToolCallRequest) => void,
    tools: ToolDefinition[],
    options: ChatOptions,
    onReasoningToken?: (token: string) => void,
    onFinish?: (info: { finishReason: "stop" | "length" | "error" }) => void
  ): Promise<void>;

  /**
   * Best-effort provider-specific cleanup when the taskpane is about to close
   * (e.g. delete a remote context cache so idle-storage billing stops).
   */
  flushCache?: () => void;
}
