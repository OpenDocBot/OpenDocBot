import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "../../providers/openai";
import { clearDebugLogs, getDebugLogs } from "../../lib/debugLog";
import type {
  LLMMessage,
  ToolCallRequest,
  ToolDefinition,
  ChatOptions,
} from "../../providers/types";

/**
 * Forces the legacy `/chat/completions` path for the existing legacy-focused
 * test suite. New Responses-API behavior is covered in openaiResponses.test.ts.
 */
class LegacyProvider extends OpenAICompatibleProvider {
  override chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: ChatOptions
  ) {
    return super.chat(messages, tools, {
      ...options,
      useLegacyChatCompletions: true,
    });
  }

  override chatStream(
    messages: LLMMessage[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: ToolCallRequest) => void,
    tools: ToolDefinition[],
    options: ChatOptions,
    onReasoningToken?: (token: string) => void
  ) {
    return super.chatStream(
      messages,
      onToken,
      onToolCall,
      tools,
      { ...options, useLegacyChatCompletions: true },
      onReasoningToken
    );
  }
}

const provider = new LegacyProvider("test", "Test", true, "gpt-4o");
const noKeyProvider = new LegacyProvider("noauth", "NoAuth", false, "local");

function mockFetchOk(json: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(json),
  } as Response);
}

function mockFetchError(status: number, body: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    status,
    statusText: body,
    text: () => Promise.resolve(body),
  } as Response);
}

function mockFetchReject(error: Error) {
  return vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(error);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// =========================================================================
// listModels
// =========================================================================
describe("listModels", () => {
  it("returns empty array for empty model list", async () => {
    mockFetchOk({ data: [] });
    const models = await provider.listModels("sk-test");
    expect(models).toEqual([]);
  });

  it("handles response with missing data field", async () => {
    mockFetchOk({});
    await expect(provider.listModels("sk-test")).rejects.toThrow();
  });

  it("handles data field as null", async () => {
    mockFetchOk({ data: null });
    await expect(provider.listModels("sk-test")).rejects.toThrow();
  });

  it("handles model entry missing id", async () => {
    mockFetchOk({ data: [{ name: "no-id" }] });
    const models = await provider.listModels("sk-test");
    expect(models).toEqual([{ id: undefined, name: undefined }]);
  });

  it("sends request to correct URL building from baseUrl", async () => {
    const fetchMock = mockFetchOk({ data: [] });
    await provider.listModels("sk-test", "https://custom.api/v1");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://custom.api/v1/models");
  });

  it("strips trailing slash from baseUrl", async () => {
    const fetchMock = mockFetchOk({ data: [] });
    await provider.listModels("sk-test", "https://custom.api/v1/");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://custom.api/v1/models");
  });

  it("strips multiple trailing slashes", async () => {
    const fetchMock = mockFetchOk({ data: [] });
    await provider.listModels("sk-test", "https://custom.api/v1///");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://custom.api/v1/models");
  });

  it("omits auth header when apiKey is empty string", async () => {
    const fetchMock = mockFetchOk({ data: [] });
    await provider.listModels("");
    const req = fetchMock.mock.calls[0][1] as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("403 Forbidden response", async () => {
    mockFetchError(403, "Forbidden");
    await expect(provider.listModels("sk-test")).rejects.toThrow("403");
  });

  it("429 Rate Limit response", async () => {
    mockFetchError(429, "Too Many Requests");
    await expect(provider.listModels("sk-test")).rejects.toThrow("429");
  });

  it("502 Bad Gateway with HTML body", async () => {
    mockFetchError(502, "<html><body>502 Bad Gateway</body></html>");
    const promise = provider.listModels("sk-test");
    await expect(promise).rejects.toThrow("502");
    await expect(promise).rejects.toThrow("Bad Gateway");
  });

  it("network failure (fetch rejects)", async () => {
    mockFetchReject(new TypeError("Failed to fetch"));
    await expect(provider.listModels("sk-test")).rejects.toThrow("Failed to fetch");
  });

  it("DNS resolution failure", async () => {
    mockFetchReject(new TypeError("fetch() URL is invalid"));
    await expect(provider.listModels("sk-test", "not-a-valid-url")).rejects.toThrow();
  });

  it("huge model list (>1000 entries)", async () => {
    const hugeList = Array.from({ length: 2000 }, (_, i) => ({ id: `model-${i}` }));
    mockFetchOk({ data: hugeList });
    const models = await provider.listModels("sk-test");
    expect(models).toHaveLength(2000);
  });

  it("model entries with special characters", async () => {
    mockFetchOk({ data: [{ id: "gpt-4o-mini" }, { id: "claude-3.5-sonnet" }] });
    const models = await provider.listModels("sk-test");
    expect(models.map((m) => m.id)).toContain("gpt-4o-mini");
    expect(models.map((m) => m.id)).toContain("claude-3.5-sonnet");
  });
});

// =========================================================================
// chat — request formation
// =========================================================================
describe("chat — request formation", () => {
  it("sends Authorization header with apiKey", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-my-key",
      model: "gpt-4o",
    });
    const req = fetchMock.mock.calls[0][1] as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-my-key"
    );
  });

  it("sends empty Authorization when apiKey is empty (no-key provider)", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await noKeyProvider.chat([{ role: "user", content: "Hi" }], [], {
      apiKey: "",
      model: "local-model",
    });
    const req = fetchMock.mock.calls[0][1] as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe(
      "Bearer "
    );
  });

  it("handles baseUrl with trailing slash correctly", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1/",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("overrides default maxTokens", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
      maxTokens: 100,
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.max_completion_tokens).toBe(100);
  });

  it("sends reasoning_effort when reasoningEffort is set", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      reasoningEffort: "xhigh",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.reasoning_effort).toBe("xhigh");
  });

  it("omits reasoning_effort when reasoningEffort is empty", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      reasoningEffort: "",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("includes Content-Type header", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const req = fetchMock.mock.calls[0][1] as RequestInit;
    expect((req.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });
});

// =========================================================================
// chat — messages serialization
// =========================================================================
describe("chat — message serialization", () => {
  it("serializes system message", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "system", content: "You are helpful." }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("serializes tool message with tool_call_id", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const msg: LLMMessage = {
      role: "tool",
      content: '{"text": "hello"}',
      tool_call_id: "call_123",
      name: "get_selection",
    };
    await provider.chat([msg], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0]).toEqual({
      role: "tool",
      content: '{"text": "hello"}',
      tool_call_id: "call_123",
      name: "get_selection",
    });
  });

  it("serializes assistant message with tool_calls", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const toolCall: ToolCallRequest = {
      id: "call_abc",
      type: "function",
      function: { name: "replace_selection", arguments: '{"new_text":"hi"}' },
    };
    const msg: LLMMessage = {
      role: "assistant",
      content: "",
      tool_calls: [toolCall],
    };
    await provider.chat([msg], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].tool_calls[0].function.name).toBe("replace_selection");
    expect(body.messages[0].tool_calls[0].function.arguments).toBe(
      '{"new_text":"hi"}'
    );
  });

  it("handles empty content string", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toBe("");
  });

  it("handles multi-message conversation", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const messages: LLMMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "What is 2+2?" },
    ];
    await provider.chat(messages, [], {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages).toHaveLength(4);
  });
});

// =========================================================================
// chat — response parsing
// =========================================================================
describe("chat — response parsing", () => {
  it("parses minimal valid response (no usage)", async () => {
    mockFetchOk({
      id: "chat-min",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBe("ok");
    expect(resp.id).toBe("chat-min");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toBeUndefined();
  });

  it("parses null content gracefully", async () => {
    mockFetchOk({
      id: "chat-null",
      choices: [{ message: { content: null }, finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBeNull();
  });

  it("parses missing message field", async () => {
    mockFetchOk({
      id: "chat-3",
      choices: [{ finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBeNull();
    expect(resp.toolCalls).toEqual([]);
  });

  it("handles completely empty response object", async () => {
    mockFetchOk({});
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBeNull();
    expect(resp.toolCalls).toEqual([]);
    expect(resp.finishReason).toBe("stop");
  });

  it("handles empty choices array", async () => {
    mockFetchOk({ id: "x", choices: [] });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBeNull();
    expect(resp.toolCalls).toEqual([]);
  });

  it("handles missing finish_reason field", async () => {
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" } }],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.finishReason).toBe("stop"); // default
  });

  it("parses finish_reason: length", async () => {
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: "truncated" }, finish_reason: "length" }],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.finishReason).toBe("length");
  });

  it("parses usage with zero tokens", async () => {
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: "" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("parses cached and written token counts from usage details", async () => {
    clearDebugLogs();
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 2006,
        completion_tokens: 300,
        prompt_tokens_details: { cached_tokens: 1920, cache_write_tokens: 0 },
      },
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.usage).toEqual({
      promptTokens: 2006,
      completionTokens: 300,
      cachedTokens: 1920,
      cacheWriteTokens: 0,
    });
    expect(
      getDebugLogs().some((l) =>
        l.msg.includes("OpenAI cache: 1920 cached / 0 written / 2006 input")
      )
    ).toBe(true);
  });

  it("handles multiple choices (picks first)", async () => {
    mockFetchOk({
      id: "x",
      choices: [
        { index: 0, message: { content: "first" }, finish_reason: "stop" },
        { index: 1, message: { content: "second" }, finish_reason: "stop" },
      ],
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBe("first");
  });
});

// =========================================================================
// chat — tool calls
// =========================================================================
describe("chat — tool calls", () => {
  it("parses single tool call", async () => {
    mockFetchOk({
      id: "tc-1",
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "get_selection", arguments: "{}" },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "read" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].id).toBe("call_1");
    expect(resp.toolCalls[0].function.name).toBe("get_selection");
    expect(resp.toolCalls[0].function.arguments).toBe("{}");
    expect(resp.finishReason).toBe("tool_calls");
  });

  it("parses multiple tool calls", async () => {
    mockFetchOk({
      id: "tc-2",
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "get_selection", arguments: "{}" },
            },
            {
              id: "call_2",
              type: "function",
              function: { name: "insert_text", arguments: '{"text":"hi"}' },
            },
          ],
        },
        finish_reason: "tool_calls",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "do it" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls).toHaveLength(2);
    expect(resp.toolCalls[0].function.name).toBe("get_selection");
    expect(resp.toolCalls[1].function.name).toBe("insert_text");
  });

  it("handles tool call with empty arguments string", async () => {
    mockFetchOk({
      id: "tc-empty",
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_e",
            type: "function",
            function: { name: "no_args", arguments: "" },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "go" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls[0].function.arguments).toBe("");
  });

  it("handles tool call with massive arguments JSON", async () => {
    const hugeArgs = JSON.stringify({ text: "x".repeat(10000) });
    mockFetchOk({
      id: "tc-big",
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_big",
            type: "function",
            function: { name: "insert_text", arguments: hugeArgs },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "big" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls[0].function.arguments).toBe(hugeArgs);
  });

  it("handles tool call with missing id", async () => {
    mockFetchOk({
      id: "tc-noid",
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            type: "function",
            function: { name: "test", arguments: "{}" },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "go" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls[0].id).toBeUndefined();
  });

  it("handles empty tool_calls array in message", async () => {
    mockFetchOk({
      id: "tc-emptyarr",
      choices: [{
        message: { content: "plain text", tool_calls: [] },
        finish_reason: "stop",
      }],
    });
    const resp = await provider.chat([{ role: "user", content: "go" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.toolCalls).toEqual([]);
    expect(resp.content).toBe("plain text");
  });

  it("passes complex tool definitions with nested parameters", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const tools: ToolDefinition[] = [{
      name: "complex_tool",
      description: "Does complex things",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                count: { type: "number" },
              },
              required: ["name"],
            },
          },
        },
        required: ["items"],
      },
    }];
    await provider.chat([{ role: "user", content: "go" }], tools, {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.tools[0].function.parameters.properties.items.type).toBe("array");
  });
});

// =========================================================================
// chat — error handling
// =========================================================================
describe("chat — error handling", () => {
  it("throws on 401 Unauthorized", async () => {
    mockFetchError(401, "Invalid API key");
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "bad-key",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/401/);
  });

  it("throws on 403 Forbidden", async () => {
    mockFetchError(403, "Forbidden");
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/403/);
  });

  it("throws on 429 Rate Limit", async () => {
    mockFetchError(429, "Rate limit exceeded");
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/429/);
  });

  it("throws on 413 Payload Too Large", async () => {
    mockFetchError(413, "Payload too large");
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/413/);
  });

  it("throws on 500 with JSON error body", async () => {
    mockFetchError(500, '{"error": {"message": "Internal server error"}}');
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/500/);
  });

  it("throws on 502 with HTML body (proxy error)", async () => {
    mockFetchError(502, "<html><h1>502 Bad Gateway</h1><p>nginx</p></html>");
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow(/502/);
  });

  it("throws on network failure", async () => {
    mockFetchReject(new TypeError("Failed to fetch"));
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow("Failed to fetch");
  });

  it("throws on AbortError", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    mockFetchReject(abortError);
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow("aborted");
  });

  it("throws on DNS failure", async () => {
    mockFetchReject(new TypeError("Failed to resolve hostname"));
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://nonexistent.example.com/v1",
      })
    ).rejects.toThrow("resolve");
  });

  it("handles response.json() throwing (invalid JSON)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response);
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow();
  });

  it("handles response.text() failing in error path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Fallback message",
      text: () => Promise.reject(new Error("cannot read body")),
    } as unknown as Response);
    await expect(
      provider.chat([{ role: "user", content: "Hi" }], [],
      {
        apiKey: "sk-test",
        model: "gpt-4o",
      })
    ).rejects.toThrow("Fallback message");
  });
});

// =========================================================================
// chat — unicode and special content
// =========================================================================
describe("chat — unicode & special content", () => {
  it("handles emoji in messages", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Summarize 📝✨🚀" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toContain("📝✨🚀");
  });

  it("handles RTL text (Arabic)", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "مرحبا بالعالم" }],
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toBe("مرحبا بالعالم");
  });

  it("handles CJK characters (Chinese)", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "你好世界" }],
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toBe("你好世界");
  });

  it("handles zero-width characters", async () => {
    const zeroWidth = "hello\u200Bworld\u200C\u200Dtest";
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: zeroWidth }, finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "test" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBe(zeroWidth);
  });

  it("handles newlines and tabs in content", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Line1\nLine2\tTabbed\nLine3" }],
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toBe("Line1\nLine2\tTabbed\nLine3");
  });

  it("handles JSON-like content in messages (not confused with structured data)", async () => {
    const withBrackets = '{"key": "value"}';
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: withBrackets }, finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "parse this" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBe(withBrackets);
  });

  it("handles HTML-like content", async () => {
    const html = "<div><script>alert('xss')</script></div>";
    mockFetchOk({
      id: "x",
      choices: [{ message: { content: html }, finish_reason: "stop" }],
    });
    const resp = await provider.chat([{ role: "user", content: "test" }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(resp.content).toBe(html);
  });

  it("handles very long content (100K chars)", async () => {
    const long = "x".repeat(100000);
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: long }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toHaveLength(100000);
  });

  it("handles control characters", async () => {
    const ctrl = "hello\x00world\x01test";
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: ctrl }], [],
      {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messages[0].content).toBe(ctrl);
  });
});

// =========================================================================
// chatStream
// =========================================================================
describe("chatStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockSSEFetch(chunks: string[], status = 200) {
    const encoder = new TextEncoder();
    let chunkIndex = 0;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(chunks.join("")),
      body: {
        getReader: () => {
          let closed = false;
          return {
            read: async () => {
              if (closed || chunkIndex >= chunks.length) {
                return { done: true, value: undefined };
              }
              const value = encoder.encode(chunks[chunkIndex]);
              chunkIndex++;
              return { done: false, value };
            },
            cancel: () => { closed = true; },
            releaseLock: () => {},
            closed: Promise.resolve(undefined),
          };
        },
      },
    } as unknown as Response);
  }

  it("streams individual tokens via onToken", async () => {
    const tokens: string[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual(["Hello", " world", "!"]);
  });

  it("logs cache usage from the final stream chunk", async () => {
    clearDebugLogs();
    const tokens: string[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":2006,"completion_tokens":300,"prompt_tokens_details":{"cached_tokens":1920,"cache_write_tokens":0}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual(["ok"]);
    expect(
      getDebugLogs().some((l) =>
        l.msg.includes("OpenAI cache: 1920 cached / 0 written / 2006 input")
      )
    ).toBe(true);
  });

  it("handles empty SSE stream (immediate [DONE])", async () => {
    const tokens: string[] = [];
    mockSSEFetch(["data: [DONE]\n\n"]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual([]);
  });

  it("resolves on successful stream completion", async () => {
    mockSSEFetch([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await expect(
      provider.chatStream(
        [{ role: "user", content: "Hi" }],
        () => {},
        () => {},
      [],        { apiKey: "sk-test", model: "gpt-4o" }
      )
    ).resolves.toBeUndefined();
  });

  it("rejects on non-200 response", async () => {
    mockSSEFetch([], 401);

    await expect(
      provider.chatStream(
        [{ role: "user", content: "Hi" }],
        () => {},
        () => {},
      [],        { apiKey: "bad-key", model: "gpt-4o" }
      )
    ).rejects.toThrow();
  });

  it("handles empty delta objects (skipped gracefully)", async () => {
    const tokens: string[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual(["ok"]);
  });

  it("handles chunk with no choices field", async () => {
    const tokens: string[] = [];
    mockSSEFetch([
      'data: {"id":"x"}\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual(["ok"]);
  });

  it("handles missing delta field in choice", async () => {
    const tokens: string[] = [];
    mockSSEFetch([
      'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toEqual([]);
  });

  it("accumulates streaming tool calls out of order", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"insert_text"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_selection"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"text\\":\\"hi\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "do things" }],
      () => {},
      (tc) => toolCalls.push(tc),
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(toolCalls).toHaveLength(2);
    const byName = toolCalls.sort((a, b) =>
      a.function.name.localeCompare(b.function.name)
    );
    expect(byName[0].function.name).toBe("get_selection");
    expect(byName[1].function.name).toBe("insert_text");
  });

  it("handles tool call chunks without index (skipped)", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"test"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      () => {},
      (tc) => toolCalls.push(tc),
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(toolCalls).toEqual([]);
  });

  it("handles tool_calls with finish_reason without prior tool_call deltas", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      () => {},
      (tc) => toolCalls.push(tc),
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(toolCalls).toEqual([]);
  });

  it("streams text and tool calls together", async () => {
    const tokens: string[] = [];
    const toolCalls: ToolCallRequest[] = [];
    mockSSEFetch([
      'data: {"choices":[{"delta":{"content":"Let me "}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_selection","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      (t) => tokens.push(t),
      (tc) => toolCalls.push(tc),
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    expect(tokens).toContain("Let me ");
    expect(toolCalls).toHaveLength(1);
  });

  it("sends correct method and headers for streaming", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    } as unknown as Response);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      () => {},
      () => {},
      [],      { apiKey: "sk-test", model: "gpt-4o" }
    );

    const req = fetchMock.mock.calls[0][1] as RequestInit;
    expect(req.method).toBe("POST");
    const body = JSON.parse(req.body as string);
    expect(body.stream).toBe(true);
  });
});

// =========================================================================
// chat — combined edge scenarios
// =========================================================================
describe("chat — combined edge scenarios", () => {
  it("uses empty apiKey with no-key provider", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await noKeyProvider.chat([{ role: "user", content: "Hi" }], [], {
      apiKey: "",
      model: "local-model",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("passes model name containing special chars", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    await provider.chat([{ role: "user", content: "Hi" }], [],
      {
      apiKey: "sk-test",
      model: "openai/gpt-4o:latest",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.model).toBe("openai/gpt-4o:latest");
  });

  it("handles very large tool count (50 tools)", async () => {
    const fetchMock = mockFetchOk({
      id: "x",
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const tools: ToolDefinition[] = Array.from({ length: 50 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool number ${i}`,
      parameters: { type: "object", properties: {} },
    }));
    await provider.chat([{ role: "user", content: "Hi" }], tools, {
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.tools).toHaveLength(50);
  });

  it("supports different provider ids via constructor", () => {
    const ollama = new OpenAICompatibleProvider("ollama", "Ollama", false, "llama3.1");
    expect(ollama.id).toBe("ollama");
    expect(ollama.requiresKey).toBe(false);
    expect(ollama.defaultModel).toBe("llama3.1");
  });
});
