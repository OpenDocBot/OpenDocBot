import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider, serializeAnthropicMessages } from "../../providers/anthropic";
import { clearDebugLogs, getDebugLogs } from "../../lib/debugLog";
import type { LLMMessage, ToolDefinition } from "../../providers/types";

const provider = new AnthropicProvider();

const opts = {
  apiKey: "sk-ant-test",
  model: "claude-haiku-4-5",
  baseUrl: "https://api.test/v1",
  maxTokens: 4096,
};

function mockChatOk(response: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
  } as Response);
}

function mockStreamOk(lines: string[]) {
  const encoder = new TextEncoder();
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
        controller.close();
      },
    }),
  } as unknown as Response);
}

function mockFetchError(status: number, body: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    status,
    statusText: body,
    text: () => Promise.resolve(body),
  } as Response);
}

function readBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init!.body as string) as Record<string, unknown>;
}

function readHeaders(init: RequestInit | undefined): Record<string, string> {
  return init!.headers as Record<string, string>;
}

const tools: ToolDefinition[] = [
  {
    name: "edit_doc_text",
    description: "Edit text in the document",
    parameters: { type: "object", properties: { old_text: { type: "string" } } },
  },
];

const messages: LLMMessage[] = [
  { role: "system", content: "You are a document assistant." },
  { role: "user", content: "Please edit the intro." },
];

beforeEach(() => {
  vi.restoreAllMocks();
  clearDebugLogs();
});

// =========================================================================
// Request wire format
// =========================================================================
describe("Anthropic — request wire format", () => {
  it("posts to /messages", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    expect(spy.mock.calls[0][0]).toBe("https://api.test/v1/messages");
  });

  it("routes through /proxy/ when proxyRequests is on", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, proxyRequests: true });
    expect(spy.mock.calls[0][0]).toBe(
      `/proxy/${encodeURIComponent("https://api.test/v1")}/messages`
    );
  });

  it("sends required auth headers including browser-access header", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    const headers = readHeaders(spy.mock.calls[0][1]);
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sets model and max_tokens", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, maxTokens: 512 });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.max_tokens).toBe(512);
  });

  it("sends output_config.effort when reasoningEffort is set", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, reasoningEffort: "medium" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.output_config).toEqual({ effort: "medium" });
  });

  it("omits output_config when reasoningEffort is empty", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, reasoningEffort: "" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.output_config).toBeUndefined();
  });

  it("defaults max_tokens to 4096 when not provided", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.max_tokens).toBe(4096);
  });

  it("hoists system messages to the top-level system field", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.system).toBe("You are a document assistant.");
    expect(body.messages).toEqual([{ role: "user", content: "Please edit the intro." }]);
  });

  it("joins multiple system messages", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(
      [
        { role: "system", content: "First." },
        { role: "system", content: "Second." },
        { role: "user", content: "Hi" },
      ],
      [],
      opts
    );
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.system).toBe("First.\n\nSecond.");
  });

  it("maps tool parameters to input_schema and sets tool_choice auto", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, tools, opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.tools).toEqual([
      {
        name: "edit_doc_text",
        description: "Edit text in the document",
        input_schema: tools[0].parameters,
      },
    ]);
    expect(body.tool_choice).toEqual({ type: "auto" });
  });

  it("omits tools when none provided", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("adds top-level cache_control when enableCache is on", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toEqual({ type: "ephemeral" });
  });

  it("uses 5m cache_control (no ttl) by default", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toEqual({ type: "ephemeral" });
  });

  it("adds ttl: 1h when cacheTtl is 1h", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, cacheTtl: "1h" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("adds ttl: 1h for chatStream when cacheTtl is 1h", async () => {
    const spy = mockStreamOk([]);
    await provider.chatStream(messages, () => {}, () => {}, [], { ...opts, cacheTtl: "1h" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("omits cache_control when enableCache is false", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, enableCache: false });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toBeUndefined();
  });

  it("omits cache_control when enableCache is false even with 1h ttl", async () => {
    const spy = mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    await provider.chat(messages, [], { ...opts, enableCache: false, cacheTtl: "1h" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.cache_control).toBeUndefined();
  });

  it("sets stream:true for chatStream", async () => {
    const spy = mockStreamOk([]);
    await provider.chatStream(messages, () => {}, () => {}, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.stream).toBe(true);
  });
});

// =========================================================================
// Message serialization
// =========================================================================
describe("serializeAnthropicMessages", () => {
  it("converts assistant tool_calls to tool_use blocks", () => {
    const msgs: LLMMessage[] = [
      {
        role: "assistant",
        content: "Let me check.",
        tool_calls: [
          {
            id: "toolu_1",
            type: "function",
            function: { name: "edit_doc_text", arguments: '{"old_text":"a"}' },
          },
        ],
      },
    ];
    expect(serializeAnthropicMessages(msgs)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "toolu_1", name: "edit_doc_text", input: { old_text: "a" } },
        ],
      },
    ]);
  });

  it("parses invalid tool arguments as empty input", () => {
    const msgs: LLMMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "toolu_1",
            type: "function",
            function: { name: "edit_doc_text", arguments: "not json" },
          },
        ],
      },
    ];
    const result = serializeAnthropicMessages(msgs) as { content: unknown[] }[];
    expect(result[0].content[0]).toEqual({
      type: "tool_use",
      id: "toolu_1",
      name: "edit_doc_text",
      input: {},
    });
  });

  it("merges consecutive tool results into one user message", () => {
    const msgs: LLMMessage[] = [
      { role: "tool", content: '{"ok":1}', tool_call_id: "toolu_1", name: "edit_doc_text" },
      { role: "tool", content: '{"ok":2}', tool_call_id: "toolu_2", name: "verify_doc" },
    ];
    expect(serializeAnthropicMessages(msgs)).toEqual([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: '{"ok":1}' },
          { type: "tool_result", tool_use_id: "toolu_2", content: '{"ok":2}' },
        ],
      },
    ]);
  });

  it("does not merge a tool result into a preceding plain user message", () => {
    const msgs: LLMMessage[] = [
      { role: "user", content: "hi" },
      { role: "tool", content: '{"ok":1}', tool_call_id: "toolu_1", name: "edit_doc_text" },
    ];
    expect(serializeAnthropicMessages(msgs)).toEqual([
      { role: "user", content: "hi" },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"ok":1}' }],
      },
    ]);
  });
});

// =========================================================================
// Response parsing (non-streaming)
// =========================================================================
describe("Anthropic — response parsing", () => {
  it("parses text content", async () => {
    mockChatOk({
      id: "msg_1",
      content: [{ type: "text", text: "Hello world" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [], opts);
    expect(resp.content).toBe("Hello world");
    expect(resp.toolCalls).toEqual([]);
    expect(resp.finishReason).toBe("stop");
  });

  it("parses tool_use blocks", async () => {
    mockChatOk({
      id: "msg_1",
      content: [
        { type: "text", text: "Doing it." },
        {
          type: "tool_use",
          id: "toolu_9",
          name: "edit_doc_text",
          input: { old_text: "a", new_text: "b" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const resp = await provider.chat([{ role: "user", content: "edit" }], [], opts);
    expect(resp.content).toBe("Doing it.");
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "toolu_9",
      type: "function",
      function: { name: "edit_doc_text", arguments: '{"old_text":"a","new_text":"b"}' },
    });
    expect(resp.finishReason).toBe("tool_calls");
  });

  it("maps stop_reason max_tokens to length", async () => {
    mockChatOk({
      id: "msg_1",
      content: [{ type: "text", text: "Partial" }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 10, output_tokens: 100 },
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [], opts);
    expect(resp.finishReason).toBe("length");
  });

  it("parses usage including cache tokens", async () => {
    mockChatOk({
      id: "msg_1",
      content: [],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 50,
        output_tokens: 20,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
      },
    });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [], opts);
    expect(resp.usage).toEqual({
      promptTokens: 50,
      completionTokens: 20,
      cachedTokens: 1000,
      cacheWriteTokens: 200,
    });
  });

  it("returns null content when no text blocks", async () => {
    mockChatOk({ id: "msg_1", content: [], stop_reason: "end_turn", usage: {} });
    const resp = await provider.chat([{ role: "user", content: "Hi" }], [], opts);
    expect(resp.content).toBeNull();
  });
});

// =========================================================================
// Error handling
// =========================================================================
describe("Anthropic — errors", () => {
  it("throws on 401", async () => {
    mockFetchError(401, "authentication_error");
    await expect(provider.chat([{ role: "user", content: "Hi" }], [], opts)).rejects.toThrow(/401/);
  });

  it("throws on 400", async () => {
    mockFetchError(400, "invalid_request_error");
    await expect(provider.chat([{ role: "user", content: "Hi" }], [], opts)).rejects.toThrow(/400/);
  });

  it("throws on 429", async () => {
    mockFetchError(429, "rate_limit_error");
    await expect(provider.chat([{ role: "user", content: "Hi" }], [], opts)).rejects.toThrow(/429/);
  });

  it("throws on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(provider.chat([{ role: "user", content: "Hi" }], [], opts)).rejects.toThrow(
      "Failed to fetch"
    );
  });

  it("includes response body in error message", async () => {
    mockFetchError(400, '{"error":{"message":"bad request"}}');
    await expect(provider.chat([{ role: "user", content: "Hi" }], [], opts)).rejects.toThrow(
      /bad request/
    );
  });
});

// =========================================================================
// Streaming
// =========================================================================
describe("Anthropic — streaming", () => {
  function sseLine(json: Record<string, unknown>): string {
    return `data: ${JSON.stringify(json)}`;
  }

  it("emits text deltas via onToken", async () => {
    const tokens: string[] = [];
    mockStreamOk([
      sseLine({ type: "message_start", message: { usage: { input_tokens: 9 } } }),
      sseLine({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      sseLine({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } }),
      sseLine({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } }),
      sseLine({ type: "content_block_stop", index: 0 }),
      sseLine({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
      sseLine({ type: "message_stop" }),
    ]);

    await provider.chatStream([{ role: "user", content: "Hi" }], (t) => tokens.push(t), () => {}, [], opts);
    expect(tokens.join("")).toBe("Hello world");
  });

  it("emits tool calls accumulated from input_json_delta", async () => {
    const calls: Array<{ name: string; arguments: string }> = [];
    mockStreamOk([
      sseLine({ type: "message_start", message: { usage: { input_tokens: 9 } } }),
      sseLine({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_1", name: "edit_doc_text" },
      }),
      sseLine({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"old' } }),
      sseLine({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '_text":"a"}' } }),
      sseLine({ type: "content_block_stop", index: 0 }),
      sseLine({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } }),
      sseLine({ type: "message_stop" }),
    ]);

    await provider.chatStream([{ role: "user", content: "edit" }], () => {}, (tc) => calls.push(tc.function), [], opts);
    expect(calls).toEqual([
      { name: "edit_doc_text", arguments: '{"old_text":"a"}' },
    ]);
  });

  it("emits thinking deltas via onReasoningToken", async () => {
    const reasoning: string[] = [];
    mockStreamOk([
      sseLine({ type: "message_start", message: { usage: { input_tokens: 9 } } }),
      sseLine({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
      sseLine({ type: "content_block_stop", index: 0 }),
      sseLine({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }),
      sseLine({ type: "message_stop" }),
    ]);

    await provider.chatStream(
      [{ role: "user", content: "Hi" }],
      () => {},
      () => {},
      [],
      opts,
      (t) => reasoning.push(t)
    );
    expect(reasoning).toEqual(["hmm"]);
  });

  it("logs cache usage for streaming", async () => {
    mockStreamOk([
      sseLine({
        type: "message_start",
        message: {
          usage: { input_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
        },
      }),
      sseLine({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }),
      sseLine({ type: "message_stop" }),
    ]);

    await provider.chatStream([{ role: "user", content: "Hi" }], () => {}, () => {}, [], opts);

    const logs = getDebugLogs();
    expect(logs.some((l) => l.msg.includes("Anthropic cache") && l.msg.includes("1000 read"))).toBe(true);
  });

  it("rejects on stream HTTP error", async () => {
    mockFetchError(400, "bad stream");
    await expect(
      provider.chatStream([{ role: "user", content: "Hi" }], () => {}, () => {}, [], opts)
    ).rejects.toThrow(/400/);
  });
});

// =========================================================================
// listModels
// =========================================================================
describe("Anthropic — listModels", () => {
  it("fetches /models and returns ids", async () => {
    const spy = mockChatOk({
      data: [
        { type: "model", id: "claude-haiku-4-5" },
        { type: "model", id: "claude-opus-5" },
      ],
    });
    const models = await provider.listModels("sk-ant-test", "https://api.test/v1");
    expect(spy.mock.calls[0][0]).toBe("https://api.test/v1/models");
    expect(models.map((m) => m.id)).toEqual(["claude-haiku-4-5", "claude-opus-5"]);
  });

  it("throws on error status", async () => {
    mockFetchError(401, "authentication_error");
    await expect(provider.listModels("bad", "https://api.test/v1")).rejects.toThrow(/401/);
  });
});

// =========================================================================
// Provider metadata
// =========================================================================
describe("Anthropic — metadata", () => {
  it("exposes provider identity", () => {
    expect(provider.id).toBe("anthropic");
    expect(provider.label).toBe("Anthropic Claude");
    expect(provider.requiresKey).toBe(true);
    expect(provider.defaultModel).toBe("claude-haiku-4-5");
  });
});
