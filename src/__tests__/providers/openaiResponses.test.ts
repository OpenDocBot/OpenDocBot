import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "../../providers/openai";
import { clearDebugLogs, getDebugLogs } from "../../lib/debugLog";
import type {
  LLMMessage,
  ToolCallRequest,
  ToolDefinition,
} from "../../providers/types";

const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");

const opts = {
  apiKey: "sk-test",
  model: "gpt-5.6-luna",
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
describe("Responses — request wire format", () => {
  it("posts to /responses by default", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], opts);
    expect(spy.mock.calls[0][0]).toBe("https://api.test/v1/responses");
  });

  it("uses legacy endpoint when useLegacyChatCompletions is true", async () => {
    const spy = mockChatOk({ id: "x", choices: [] });
    await provider.chat(messages, [], { ...opts, useLegacyChatCompletions: true });
    expect(spy.mock.calls[0][0]).toBe("https://api.test/v1/chat/completions");
  });

  it("routes through /proxy/ when proxyRequests is on", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, proxyRequests: true });
    expect(spy.mock.calls[0][0]).toBe(
      `/proxy/${encodeURIComponent("https://api.test/v1")}/responses`
    );
  });

  it("uses the proxied legacy endpoint when proxyRequests and legacy are both on", async () => {
    const spy = mockChatOk({ id: "x", choices: [] });
    await provider.chat(messages, [], {
      ...opts,
      proxyRequests: true,
      useLegacyChatCompletions: true,
    });
    expect(spy.mock.calls[0][0]).toBe(
      `/proxy/${encodeURIComponent("https://api.test/v1")}/chat/completions`
    );
  });

  it("routes streamed requests through /proxy/ when proxyRequests is on", async () => {
    const spy = mockStreamOk([
      'data: {"type":"response.output_text.delta","delta":"hi"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);
    await provider.chatStream(messages, () => {}, () => {}, [], {
      ...opts,
      proxyRequests: true,
    });
    expect(spy.mock.calls[0][0]).toBe(
      `/proxy/${encodeURIComponent("https://api.test/v1")}/responses`
    );
  });

  it("maps system message to top-level instructions and drops it from input", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.instructions).toBe("You are a document assistant.");
    expect(body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Please edit the intro." }] },
    ]);
  });

  it("maps user, assistant, and tool messages to input items", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    const msgs: LLMMessage[] = [
      { role: "system", content: "You are a document assistant." },
      { role: "user", content: "Please edit the intro." },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "edit_doc_text", arguments: '{"old_text":"Intro"}' } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: '{"success":true}' },
      { role: "assistant", content: "Done." },
    ];
    await provider.chat(msgs, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.input).toEqual([
      { type: "message", role: "user", content: [{ type: "input_text", text: "Please edit the intro." }] },
      {
        type: "function_call",
        call_id: "call_1",
        name: "edit_doc_text",
        arguments: '{"old_text":"Intro"}',
      },
      { type: "function_call_output", call_id: "call_1", output: '{"success":true}' },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Done." }] },
    ]);
  });

  it("maps assistant message with content AND tool_calls to separate items", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    const msgs: LLMMessage[] = [
      {
        role: "assistant",
        content: "Let me fix it",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "edit_doc_text", arguments: "{}" } },
        ],
      },
    ];
    await provider.chat(msgs, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.input).toEqual([
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Let me fix it" }] },
      { type: "function_call", call_id: "c1", name: "edit_doc_text", arguments: "{}" },
    ]);
  });

  it("serializes tools in flat Responses format with tool_choice auto", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, tools, opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "edit_doc_text",
        description: "Edit text in the document",
        parameters: { type: "object", properties: { old_text: { type: "string" } } },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
  });

  it("omits tools when none provided", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("sends max_output_tokens", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, maxTokens: 512 });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.max_output_tokens).toBe(512);
  });

  it("sends reasoning.effort when reasoningEffort is set", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, reasoningEffort: "high" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("omits reasoning when reasoningEffort is empty", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, reasoningEffort: "" });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.reasoning).toBeUndefined();
  });

  it("clamps max_output_tokens below the API minimum", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, maxTokens: 10 });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.max_output_tokens).toBe(16);
  });

  it("clamps max_output_tokens to a minimum of 1", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], { ...opts, maxTokens: 1 });
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.max_output_tokens).toBe(16);
  });

  it("defaults max_output_tokens to 4096 when unset", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    const { maxTokens, ...restOpts } = opts;
    void maxTokens;
    await provider.chat(messages, [], restOpts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.max_output_tokens).toBe(4096);
  });

  it("sends Authorization header", async () => {
    const spy = mockChatOk({ id: "resp_1", output: [], status: "completed" });
    await provider.chat(messages, [], opts);
    const req = spy.mock.calls[0][1] as RequestInit;
    expect((req.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("adds stream:true in chatStream", async () => {
    const spy = mockStreamOk([]);
    await provider.chatStream(messages, () => {}, () => {}, [], opts);
    const body = readBody(spy.mock.calls[0][1]);
    expect(body.stream).toBe(true);
  });
});

// =========================================================================
// Non-streaming response parsing
// =========================================================================
describe("Responses — non-streaming response parsing", () => {
  it("parses plain text output", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.content).toBe("Hello");
    expect(resp.toolCalls).toEqual([]);
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      cachedTokens: undefined,
      cacheWriteTokens: undefined,
    });
  });

  it("concatenates multiple output_text parts", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "Hello" },
            { type: "output_text", text: " world" },
          ],
        },
      ],
    });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.content).toBe("Hello world");
  });

  it("parses function_call output items into tool calls", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "edit_doc_text",
          arguments: '{"old_text":"Intro"}',
        },
      ],
    });
    const resp = await provider.chat(messages, tools, opts);
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "edit_doc_text", arguments: '{"old_text":"Intro"}' },
    });
    expect(resp.finishReason).toBe("tool_calls");
  });

  it("parses multiple parallel function calls", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [
        { type: "function_call", call_id: "c1", name: "read_doc_section", arguments: "{}" },
        { type: "function_call", call_id: "c2", name: "verify_doc", arguments: "{}" },
      ],
    });
    const resp = await provider.chat(messages, tools, opts);
    expect(resp.toolCalls).toHaveLength(2);
    expect(resp.toolCalls[0].function.name).toBe("read_doc_section");
    expect(resp.toolCalls[1].function.name).toBe("verify_doc");
  });

  it("parses text and function calls together", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "Checking..." }] },
        { type: "function_call", call_id: "c1", name: "read_doc_section", arguments: "{}" },
      ],
    });
    const resp = await provider.chat(messages, tools, opts);
    expect(resp.content).toBe("Checking...");
    expect(resp.toolCalls).toHaveLength(1);
  });

  it("maps incomplete status to finishReason length", async () => {
    mockChatOk({
      id: "resp_1",
      status: "incomplete",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "partial" }] }],
    });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.finishReason).toBe("length");
    expect(resp.content).toBe("partial");
  });

  it("parses cached token usage details", async () => {
    mockChatOk({
      id: "resp_1",
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
      usage: {
        input_tokens: 2006,
        output_tokens: 300,
        input_tokens_details: { cached_tokens: 1920 },
        cache_write_input_tokens: 86,
      },
    });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.usage).toEqual({
      promptTokens: 2006,
      completionTokens: 300,
      cachedTokens: 1920,
      cacheWriteTokens: 86,
    });
    expect(
      getDebugLogs().some((l) => l.msg.includes("OpenAI cache: 1920 cached / 86 written / 2006 input"))
    ).toBe(true);
  });

  it("handles empty output array", async () => {
    mockChatOk({ id: "resp_1", status: "completed", output: [] });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.content).toBeNull();
    expect(resp.toolCalls).toEqual([]);
    expect(resp.finishReason).toBe("stop");
  });

  it("handles missing output field", async () => {
    mockChatOk({ id: "resp_1", status: "completed" });
    const resp = await provider.chat(messages, [], opts);
    expect(resp.content).toBeNull();
    expect(resp.toolCalls).toEqual([]);
  });
});

// =========================================================================
// Error handling
// =========================================================================
describe("Responses — error handling", () => {
  it("throws on 401", async () => {
    mockFetchError(401, "Invalid API key");
    await expect(provider.chat(messages, [], opts)).rejects.toThrow(/401/);
  });

  it("throws on 400 with JSON error body", async () => {
    mockFetchError(400, '{"error":{"message":"Bad request"}}');
    await expect(provider.chat(messages, [], opts)).rejects.toThrow(/400/);
  });

  it("throws on 429 rate limit", async () => {
    mockFetchError(429, "Rate limit exceeded");
    await expect(provider.chat(messages, [], opts)).rejects.toThrow(/429/);
  });

  it("throws on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(provider.chat(messages, [], opts)).rejects.toThrow("Failed to fetch");
  });

  it("throws on non-200 in chatStream", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(
      provider.chatStream(messages, () => {}, () => {}, [], opts)
    ).rejects.toThrow();
  });
});

// =========================================================================
// Streaming
// =========================================================================
describe("Responses — streaming", () => {
  it("streams text tokens via output_text.delta", async () => {
    const tokens: string[] = [];
    mockStreamOk([
      'data: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}',
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      'data: {"type":"response.output_text.delta","delta":" world"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":10,"output_tokens":2}}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(messages, (t) => tokens.push(t), () => {}, [], opts);
    expect(tokens).toEqual(["Hello", " world"]);
  });

  it("emits reasoning tokens via reasoning_summary_text.delta", async () => {
    const reasoning: string[] = [];
    const tokens: string[] = [];
    mockStreamOk([
      'data: {"type":"response.reasoning_summary_text.delta","delta":"thinking..."}',
      'data: {"type":"response.output_text.delta","delta":"answer"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(
      messages,
      (t) => tokens.push(t),
      () => {},
      [],
      opts,
      (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["thinking..."]);
    expect(tokens).toEqual(["answer"]);
  });

  it("emits reasoning tokens via reasoning_text.delta (Zen Go)", async () => {
    const reasoning: string[] = [];
    const tokens: string[] = [];
    mockStreamOk([
      'data: {"type":"response.reasoning_text.delta","delta":"We"}',
      'data: {"type":"response.reasoning_text.delta","delta":" need"}',
      'data: {"type":"response.reasoning_text.done"}',
      'data: {"type":"response.output_text.delta","delta":"answer"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(
      messages,
      (t) => tokens.push(t),
      () => {},
      [],
      opts,
      (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["We", " need"]);
    expect(tokens).toEqual(["answer"]);
  });

  it("assembles a streamed function call across delta events", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockStreamOk([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"edit_doc_text"}}',
      'data: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\\"old_text\\":"}',
      'data: {"type":"response.function_call_arguments.delta","output_index":0,"delta":"\\"Intro\\"}"}',
      'data: {"type":"response.function_call_arguments.done","output_index":0,"arguments":"{\\"old_text\\":\\"Intro\\"}"}',
      'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"edit_doc_text","arguments":"{\\"old_text\\":\\"Intro\\"}"}}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(
      messages,
      () => {},
      (tc) => toolCalls.push(tc),
      tools,
      opts
    );
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "edit_doc_text", arguments: '{"old_text":"Intro"}' },
    });
  });

  it("assembles parallel streamed function calls", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockStreamOk([
      'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"c1","name":"read_doc_section"}}',
      'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"c2","name":"verify_doc"}}',
      'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"c1","name":"read_doc_section","arguments":"{}"}}',
      'data: {"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","id":"fc_2","call_id":"c2","name":"verify_doc","arguments":"{}"}}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(
      messages,
      () => {},
      (tc) => toolCalls.push(tc),
      tools,
      opts
    );
    expect(toolCalls).toHaveLength(2);
    const names = toolCalls.map((c) => c.function.name).sort();
    expect(names).toEqual(["read_doc_section", "verify_doc"]);
  });

  it("uses output_item.done arguments when present", async () => {
    const toolCalls: ToolCallRequest[] = [];
    mockStreamOk([
      'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"edit_doc_text","arguments":"{\\"old_text\\":\\"Intro\\"}"}}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed"}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(
      messages,
      () => {},
      (tc) => toolCalls.push(tc),
      tools,
      opts
    );
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].function.arguments).toBe('{"old_text":"Intro"}');
  });

  it("logs usage from the completed event", async () => {
    const tokens: string[] = [];
    mockStreamOk([
      'data: {"type":"response.output_text.delta","delta":"ok"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input_tokens":2006,"output_tokens":300,"input_tokens_details":{"cached_tokens":1920},"cache_write_input_tokens":86}}}',
      "data: [DONE]",
    ]);

    await provider.chatStream(messages, (t) => tokens.push(t), () => {}, [], opts);
    expect(tokens).toEqual(["ok"]);
    expect(
      getDebugLogs().some((l) => l.msg.includes("OpenAI cache: 1920 cached / 86 written / 2006 input"))
    ).toBe(true);
  });

  it("handles empty stream with immediate [DONE]", async () => {
    mockStreamOk(["data: [DONE]"]);
    await expect(
      provider.chatStream(messages, () => {}, () => {}, [], opts)
    ).resolves.toBeUndefined();
  });

  it("rejects when the stream reports an error event", async () => {
    mockStreamOk([
      'data: {"type":"error","message":"Insufficient output tokens","code":"max_output_tokens"}',
      "data: [DONE]",
    ]);
    await expect(
      provider.chatStream(messages, () => {}, () => {}, [], opts)
    ).rejects.toThrow(/Insufficient output tokens/);
  });

  it("rejects when response.completed reports status failed", async () => {
    mockStreamOk([
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"failed","error":{"message":"Provider exploded"}}}',
      "data: [DONE]",
    ]);
    await expect(
      provider.chatStream(messages, () => {}, () => {}, [], opts)
    ).rejects.toThrow(/Provider exploded/);
  });

  it("calls onFinish with finishReason length on max_output_tokens", async () => {
    const finishes: string[] = [];
    mockStreamOk([
      'data: {"type":"response.output_text.delta","delta":"partial"}',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","incomplete_details":{"reason":"max_output_tokens"}}}',
      "data: [DONE]",
    ]);
    await provider.chatStream(
      messages,
      () => {},
      () => {},
      [],
      opts,
      undefined,
      (info) => finishes.push(info.finishReason)
    );
    expect(finishes).toEqual(["length"]);
  });

  it("calls onFinish with finishReason error when the fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network down"));
    const finishes: string[] = [];
    await expect(
      provider.chatStream(
        messages,
        () => {},
        () => {},
        [],
        opts,
        undefined,
        (info) => finishes.push(info.finishReason)
      )
    ).rejects.toThrow(/network down/);
    expect(finishes).toEqual(["error"]);
  });
});
