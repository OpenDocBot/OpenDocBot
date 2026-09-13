import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "../../providers/gemini";
import type { LLMMessage, ToolCallRequest, ToolDefinition } from "../../providers/types";

let provider: GeminiProvider;

const opts = {
  apiKey: "key",
  model: "gemini-x",
  baseUrl: "https://api.test",
  enableCache: false,
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

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new GeminiProvider();
});

describe("GeminiProvider — request wire format", () => {
  it("maps system to systemInstruction and leaves it out of contents", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "system", content: "You are helpful." }], [], opts);

    const [, init] = spy.mock.calls[0];
    const body = readBody(init);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are helpful." }] });
    expect(body.contents).toEqual([]);
  });

  it("maps a user message to contents", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "Hi" }], [], opts);

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
  });

  it("maps assistant content and tool_calls to model parts", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat(
      [
        {
          role: "assistant",
          content: "Let me fix it",
          tool_calls: [
            { id: "c1", type: "function", function: { name: "edit_doc_text", arguments: '{"old_text":"Intro","new_text":"Intro!"}' } },
          ],
        },
      ],
      [],
      opts,
    );

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.contents).toEqual([
      {
        role: "model",
        parts: [
          { text: "Let me fix it" },
          { functionCall: { name: "edit_doc_text", args: { old_text: "Intro", new_text: "Intro!" } } },
        ],
      },
    ]);
  });

  it("carries the thoughtSignature on the functionCall part", async () => {
    const spy = mockChatOk({ candidates: [] });
    const tc: ToolCallRequest & { _geminiThoughtSignature?: string } = {
      id: "c1",
      type: "function",
      function: { name: "read_doc_section", arguments: "{}" },
    };
    tc._geminiThoughtSignature = "sig_abc";

    await provider.chat([{ role: "assistant", content: null, tool_calls: [tc] }], [], opts);

    const body = readBody(spy.mock.calls[0][1]);
    expect((body.contents as unknown[])[0]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "read_doc_section", args: {} }, thoughtSignature: "sig_abc" }],
    });
  });

  it("maps tool results to a user functionResponse part", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat(
      [{ role: "tool", content: '{"ok":true}', name: "edit_doc_text", tool_call_id: "c1" }],
      [],
      opts,
    );

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [{ functionResponse: { name: "edit_doc_text", response: { ok: true } } }],
      },
    ]);
  });

  it("serializes tools as functionDeclarations", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "go" }], tools, opts);

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          { name: "edit_doc_text", description: "Edit text in the document", parameters: { type: "object", properties: { old_text: { type: "string" } } } },
        ],
      },
    ]);
  });

  it("sends maxTokens as generationConfig.maxOutputTokens", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, maxTokens: 512 });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 512 });
  });

  it("maps a label reasoningEffort to thinkingConfig.thinkingLevel", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, reasoningEffort: "high" });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingLevel: "high" } });
  });

  it("maps a numeric reasoningEffort to thinkingConfig.thinkingBudget", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, reasoningEffort: "1024" });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.generationConfig).toEqual({ thinkingConfig: { thinkingBudget: 1024 } });
  });

  it("merges reasoning effort with maxTokens in generationConfig", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, maxTokens: 512, reasoningEffort: "low" });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.generationConfig).toEqual({
      maxOutputTokens: 512,
      thinkingConfig: { thinkingLevel: "low" },
    });
  });

  it("omits thinkingConfig when reasoningEffort is empty", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, reasoningEffort: "" });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body.generationConfig).toBeUndefined();
  });

  it("uses the generateContent endpoint with auth headers", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, baseUrl: "https://api.test" });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.test/models/gemini-x:generateContent");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-goog-api-key"]).toBe("key");
  });

  it("routes through /proxy/ when proxyRequests is on", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "hi" }], [], {
      ...opts,
      baseUrl: "https://api.test",
      proxyRequests: true,
    });

    const [url] = spy.mock.calls[0];
    expect(url).toBe(
      `/proxy/${encodeURIComponent("https://api.test")}/models/gemini-x:generateContent`
    );
  });

  it("sends the full request body unchanged (golden snapshot)", async () => {
    const spy = mockChatOk({ candidates: [] });
    const messages: LLMMessage[] = [
      { role: "system", content: "You are a document assistant." },
      { role: "user", content: "Fix the intro" },
      {
        role: "assistant",
        content: "Let me fix it",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "edit_doc_text", arguments: '{"old_text":"Intro","new_text":"Intro!"}' } },
        ],
      },
      { role: "tool", content: '{"ok":true}', name: "edit_doc_text", tool_call_id: "c1" },
    ];

    await provider.chat(messages, tools, { ...opts, maxTokens: 512 });

    const body = readBody(spy.mock.calls[0][1]);
    expect(body).toMatchSnapshot();
  });
});

describe("GeminiProvider — tool schema sanitization", () => {
  interface ParamSchema {
    type?: unknown;
    nullable?: boolean;
    properties?: Record<string, ParamSchema>;
    items?: ParamSchema;
  }

  function readDecls(body: Record<string, unknown>) {
    const tools = body.tools as Array<{ functionDeclarations: Array<{ parameters: ParamSchema }> }>;
    return tools[0].functionDeclarations;
  }

  it("collapses a union type to a single type", async () => {
    const spy = mockChatOk({ candidates: [] });
    const unionTools: ToolDefinition[] = [
      {
        name: "write_range",
        description: "Write values",
        parameters: {
          type: "object",
          properties: {
            sheet_name: { type: "string" },
            value: { type: ["string", "number", "boolean"] },
            clear: { type: "boolean" },
          },
        },
      },
    ];
    await provider.chat([{ role: "user", content: "go" }], unionTools, opts);

    const decls = readDecls(readBody(spy.mock.calls[0][1]));
    expect(decls[0].parameters.properties!.value).toEqual({ type: "string" });
  });

  it("marks nullable when the union contains null", async () => {
    const spy = mockChatOk({ candidates: [] });
    const nullableTools: ToolDefinition[] = [
      {
        name: "tool",
        description: "desc",
        parameters: { type: "object", properties: { v: { type: ["string", "null"] } } },
      },
    ];
    await provider.chat([{ role: "user", content: "go" }], nullableTools, opts);

    const decls = readDecls(readBody(spy.mock.calls[0][1]));
    expect(decls[0].parameters.properties!.v).toEqual({ type: "string", nullable: true });
  });

  it("recurses into nested properties and items", async () => {
    const spy = mockChatOk({ candidates: [] });
    const nestedTools: ToolDefinition[] = [
      {
        name: "tool",
        description: "desc",
        parameters: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: { type: "object", properties: { cell: { type: ["number", "string"] } } },
            },
          },
        },
      },
    ];
    await provider.chat([{ role: "user", content: "go" }], nestedTools, opts);

    const decls = readDecls(readBody(spy.mock.calls[0][1]));
    expect(decls[0].parameters.properties!.rows.items!.properties!.cell).toEqual({ type: "number" });
  });

  it("injects items for nested arrays that lack them", async () => {
    const spy = mockChatOk({ candidates: [] });
    const matrixTools: ToolDefinition[] = [
      {
        name: "write_range",
        description: "desc",
        parameters: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { type: "array" },
            },
          },
        },
      },
    ];
    await provider.chat([{ role: "user", content: "go" }], matrixTools, opts);

    const decls = readDecls(readBody(spy.mock.calls[0][1]));
    expect(decls[0].parameters.properties!.data).toEqual({
      type: "array",
      items: { type: "array", items: {} },
    });
  });

  it("leaves a plain schema unchanged", async () => {
    const spy = mockChatOk({ candidates: [] });
    await provider.chat([{ role: "user", content: "go" }], tools, opts);

    const decls = readDecls(readBody(spy.mock.calls[0][1]));
    expect(decls[0].parameters).toEqual({
      type: "object",
      properties: { old_text: { type: "string" } },
    });
  });
});

describe("GeminiProvider — non-streaming response parsing", () => {
  it("extracts text and stop finish reason", async () => {
    mockChatOk({
      candidates: [{ content: { role: "model", parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
    });
    const res = await provider.chat([{ role: "user", content: "hi" }], [], opts);

    expect(res.content).toBe("Hello");
    expect(res.finishReason).toBe("stop");
  });

  it("extracts tool calls with parsed arguments and thought signature", async () => {
    mockChatOk({
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              { text: "Checking" },
              { functionCall: { name: "edit_doc_text", args: { old_text: "x", new_text: "y" } }, thoughtSignature: "sig_1" },
            ],
          },
          finishReason: "STOP",
        },
      ],
    });
    const res = await provider.chat([{ role: "user", content: "hi" }], [], opts);

    expect(res.content).toBe("Checking");
    expect(res.finishReason).toBe("stop");
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe("edit_doc_text");
    expect(res.toolCalls[0].function.arguments).toBe('{"old_text":"x","new_text":"y"}');
    expect((res.toolCalls[0] as ToolCallRequest & { _geminiThoughtSignature?: string })._geminiThoughtSignature).toBe("sig_1");
  });

  it("ignores thought parts and maps non-STOP to tool_calls", async () => {
    mockChatOk({
      candidates: [
        {
          content: { role: "model", parts: [{ thought: "reasoning" }, { text: "final" }] },
          finishReason: "MAX_TOKENS",
        },
      ],
    });
    const res = await provider.chat([{ role: "user", content: "hi" }], [], opts);

    expect(res.content).toBe("final");
    expect(res.finishReason).toBe("tool_calls");
  });
});

describe("GeminiProvider — streaming response parsing", () => {
  const streamMessages: LLMMessage[] = [{ role: "user", content: "go" }];

  it("emits text tokens and reasoning tokens separately", async () => {
    mockStreamOk([
      'data: {"candidates":[{"content":{"role":"model","parts":[{"thought":{"text":"thinking...","thought_signature":"sig_abc"}}]}}]}',
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Hello "}]}}]}',
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"world"}]}}]}',
    ]);

    const tokens: string[] = [];
    const reasoning: string[] = [];
    const toolCalls: ToolCallRequest[] = [];
    await provider.chatStream(streamMessages, (t) => tokens.push(t), (tc) => toolCalls.push(tc), [], opts, (t) => reasoning.push(t));

    expect(tokens).toEqual(["Hello ", "world"]);
    expect(reasoning).toEqual(["thinking..."]);
    expect(toolCalls).toEqual([]);
  });

  it("captures thoughtSignature and attaches it to the following tool call", async () => {
    mockStreamOk([
      'data: {"candidates":[{"content":{"role":"model","parts":[{"thought":{"text":"reason","thought_signature":"sig_abc"}}]}}]}',
      'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"read_doc_section","args":{}},"thoughtSignature":"sig_abc"}]}}]}',
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Done"}]}}]}',
    ]);

    const tokens: string[] = [];
    const toolCalls: ToolCallRequest[] = [];
    await provider.chatStream(streamMessages, (t) => tokens.push(t), (tc) => toolCalls.push(tc), [], opts);

    expect(tokens).toEqual(["Done"]);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].function.name).toBe("read_doc_section");
    expect(toolCalls[0].function.arguments).toBe("{}");
    expect((toolCalls[0] as ToolCallRequest & { _geminiThoughtSignature?: string })._geminiThoughtSignature).toBe("sig_abc");
  });

  it("emits multiple tool calls at the end of the stream", async () => {
    mockStreamOk([
      'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"a_tool","args":{}}}]}}]}',
      'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"b_tool","args":{"n":1}}}]}}]}',
    ]);

    const toolCalls: ToolCallRequest[] = [];
    await provider.chatStream(streamMessages, () => {}, (tc) => toolCalls.push(tc), [], opts);

    expect(toolCalls.map((t) => t.function.name)).toEqual(["a_tool", "b_tool"]);
    expect(toolCalls[1].function.arguments).toBe('{"n":1}');
  });

  it("uses the streamGenerateContent endpoint", async () => {
    const spy = mockStreamOk(['data: {"candidates":[]}']);
    await provider.chatStream(streamMessages, () => {}, () => {}, [], { ...opts, baseUrl: "https://api.test" });

    const [url] = spy.mock.calls[0];
    expect(url).toBe("https://api.test/models/gemini-x:streamGenerateContent?alt=sse");
  });
});

describe("GeminiProvider — listModels", () => {
  it("filters Gemini models, drops thinking variants, and strips the prefix", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        models: [
          { name: "models/gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite" },
          { name: "models/gemini-3-thinking", displayName: "Gemini 3 Thinking" },
          { name: "models/other-model", displayName: "Other" },
          { name: "models/gemini-x", displayName: "" },
        ],
      }),
    } as Response);

    const models = await provider.listModels("key", "https://api.test");
    expect(models).toEqual([
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-x", name: "gemini-x" },
    ]);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.test/models");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
  });
});

describe("GeminiProvider — error handling", () => {
  it("throws Gemini error with status and body for non-cache failures", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(provider.chat([{ role: "user", content: "hi" }], [], opts)).rejects.toThrow("Gemini error 401: Unauthorized");
  });

  it("throws for JSON error bodies", async () => {
    mockFetchError(400, '{"error":{"message":"invalid argument"}}');
    await expect(provider.chat([{ role: "user", content: "hi" }], [], opts)).rejects.toThrow(
      'Gemini error 400: {"error":{"message":"invalid argument"}}'
    );
  });
});

describe("GeminiProvider — cache invalidation on system-prompt change", () => {
  const mk = (role: "user" | "assistant", n: number) => ({
    role,
    content: `message ${n} `.repeat(300),
  });
  const sysA = { role: "system" as const, content: "You are a document assistant. " + "a".repeat(3000) };
  const sysB = { role: "system" as const, content: "You are a document assistant. " + "b".repeat(3000) };
  const cacheOpts = { ...opts, enableCache: true, recacheThreshold: 2000 };

  function mockCacheEndpoints() {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(":generateContent")) {
        bodies.push(String(init?.body ?? ""));
        return { ok: true, status: 200, json: () => Promise.resolve({ candidates: [] }) } as Response;
      }
      if (url.endsWith("/cachedContents") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            name: "cachedContents/c1",
            model: "models/gemini-x",
            createTime: "",
            updateTime: "",
            expireTime: new Date(Date.now() + 3600000).toISOString(),
          }),
        } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });
    return bodies;
  }

  it("reuses the cache with an unchanged system prompt", async () => {
    const bodies = mockCacheEndpoints();
    provider = new GeminiProvider();

    // Turn 1: creates the cache, sends the full body
    await provider.chat([sysA, mk("user", 1), mk("assistant", 1), mk("user", 2)], [], cacheOpts);
    expect(JSON.parse(bodies[bodies.length - 1]).cachedContent).toBeUndefined();
    expect(JSON.parse(bodies[bodies.length - 1]).systemInstruction).toBeDefined();

    // Turn 2: system unchanged → cache reused, only cachedContent sent
    await provider.chat(
      [sysA, mk("user", 1), mk("assistant", 1), mk("user", 2), mk("assistant", 2), mk("user", 3)],
      [],
      cacheOpts
    );
    expect(JSON.parse(bodies[bodies.length - 1]).cachedContent).toBe("cachedContents/c1");
    expect(JSON.parse(bodies[bodies.length - 1]).systemInstruction).toBeUndefined();
  });

  it("invalidates the cache and resends the full body when the system prompt changes", async () => {
    const bodies = mockCacheEndpoints();
    provider = new GeminiProvider();

    await provider.chat([sysA, mk("user", 1), mk("assistant", 1), mk("user", 2)], [], cacheOpts);
    await provider.chat(
      [sysA, mk("user", 1), mk("assistant", 1), mk("user", 2), mk("assistant", 2), mk("user", 3)],
      [],
      cacheOpts
    );
    // Confirm the cache was being reused before the change
    expect(JSON.parse(bodies[bodies.length - 1]).cachedContent).toBe("cachedContents/c1");

    // Turn 3: system prompt changed → invalidated, full body resent with new instructions
    await provider.chat(
      [sysB, mk("user", 1), mk("assistant", 1), mk("user", 2), mk("assistant", 2), mk("user", 3)],
      [],
      cacheOpts
    );
    const last = JSON.parse(bodies[bodies.length - 1]);
    expect(last.cachedContent).toBeUndefined();
    expect(last.systemInstruction).toBeDefined();
    expect(last.systemInstruction.parts[0].text).toContain("b".repeat(3000));
  });
});
