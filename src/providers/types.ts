export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCallRequest[];
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
