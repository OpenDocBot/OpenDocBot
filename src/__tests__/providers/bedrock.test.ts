import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  BedrockProvider,
  buildConverseBody,
  parseConverseResponse,
} from "../../providers/bedrock";
import { clearBedrockModelCache, buildBedrockModelList } from "../../lib/bedrockModels";
import type { ChatOptions, LLMMessage, ToolDefinition } from "../../providers/types";

const provider = new BedrockProvider();
const encoder = new TextEncoder();

const opts: ChatOptions = {
  apiKey: "bedrock-key",
  model: "nvidia.nemotron-super-3-120b",
  region: "eu-north-1",
  maxTokens: 128,
};

beforeEach(() => clearBedrockModelCache());
afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// EventStream frame helpers
// ---------------------------------------------------------------------------

function encodeHeaders(headers: Record<string, string>): Uint8Array {
  const bytes: number[] = [];
  for (const [key, value] of Object.entries(headers)) {
    const name = encoder.encode(key);
    const val = encoder.encode(value);
    bytes.push(name.length, ...name, 7, (val.length >> 8) & 0xff, val.length & 0xff, ...val);
  }
  return new Uint8Array(bytes);
}

/**
 * Build one AWS EventStream frame. Tests pass a compact single-key object
 * (`{ eventType: body }`); on the wire the event type is the `:event-type`
 * header and the body is the bare payload, so lift it here.
 */
function frame(payload: unknown, headers: Record<string, string> = {}): Uint8Array {
  const hdrs: Record<string, string> = { ":message-type": "event" };
  let body = payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const entries = Object.entries(payload as Record<string, unknown>);
    if (entries.length === 1) {
      hdrs[":event-type"] = entries[0][0];
      body = entries[0][1];
    }
  }
  Object.assign(hdrs, headers);
  const payloadBytes = encoder.encode(JSON.stringify(body));
  const headerBytes = encodeHeaders(hdrs);
  const total = 12 + headerBytes.length + payloadBytes.length + 4;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headerBytes.length);
  buf.set(headerBytes, 12);
  buf.set(payloadBytes, 12 + headerBytes.length);
  return buf;
}

function streamFromChunks(chunks: Uint8Array[]): Response {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  } as unknown as Response;
}

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errJson(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

// Capability summaries for the registry.
function summary(partial: Record<string, unknown>) {
  return {
    modelId: "model",
    modelName: "Model",
    providerName: "Prov",
    outputModalities: ["TEXT"],
    modelLifecycle: { status: "ACTIVE" },
    inferenceTypesSupported: ["ON_DEMAND"],
    inferenceAPIsSupported: { converse: { sync: true, streaming: true } },
    explicitPromptCaching: { isSupported: false },
    converse: { systemRoleSupported: true, userImageTypesSupported: [], reasoningSupported: null },
    ...partial,
  };
}

function registerCapabilities(modelId: string, explicitPromptCaching: boolean): void {
  buildBedrockModelList([summary({ modelId, explicitPromptCaching: { isSupported: explicitPromptCaching } })], []);
}

// ---------------------------------------------------------------------------
// buildConverseBody — message serialization
// ---------------------------------------------------------------------------

describe("buildConverseBody — messages", () => {
  it("hoists system, maps user/assistant/tool and merges tool results", () => {
    const messages: LLMMessage[] = [
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "calling",
        tool_calls: [{ id: "t1", type: "function", function: { name: "do", arguments: '{"x":1}' } }],
      },
      { role: "tool", tool_call_id: "t1", content: '{"ok":true}' },
      { role: "tool", tool_call_id: "t2", content: "second" },
    ];
    const body = buildConverseBody(messages, [], opts);
    expect(body.system).toEqual([{ text: "A" }, { text: "B" }]);
    const out = body.messages as { role: string; content: Record<string, unknown>[] }[];
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ role: "user", content: [{ text: "hi" }] });
    expect(out[1].content).toEqual([
      { text: "calling" },
      { toolUse: { toolUseId: "t1", name: "do", input: { x: 1 } } },
    ]);
    // Consecutive tool results collapse into one user message.
    expect(out[2].role).toBe("user");
    expect(out[2].content).toHaveLength(2);
    expect(out[2].content[0]).toMatchObject({ toolResult: { toolUseId: "t1", status: "success" } });
    expect(out[2].content[1]).toMatchObject({ toolResult: { toolUseId: "t2" } });
  });

  it("merges consecutive user messages", () => {
    const body = buildConverseBody(
      [
        { role: "user", content: "first" },
        { role: "user", content: "second" },
      ],
      [],
      opts
    );
    const out = body.messages as { role: string; content: unknown[] }[];
    expect(out).toHaveLength(1);
    expect(out[0].content).toEqual([{ text: "first" }, { text: "second" }]);
  });

  it("tolerates malformed tool arguments", () => {
    const body = buildConverseBody(
      [
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "t1", type: "function", function: { name: "do", arguments: "not json" } }],
        },
      ],
      [],
      opts
    );
    const out = body.messages as { content: { toolUse?: { input?: unknown } }[] }[];
    expect(out[0].content[0].toolUse?.input).toEqual({});
  });

  it("omits an assistant message with no content and no tool calls", () => {
    const body = buildConverseBody([{ role: "assistant", content: null }], [], opts);
    expect(body.messages).toEqual([]);
  });

  it("omits system entries with empty content", () => {
    const body = buildConverseBody([{ role: "system", content: "" }, { role: "user", content: "x" }], [], opts);
    expect(body.system).toBeUndefined();
  });

  it("produces an empty message array for empty input", () => {
    const body = buildConverseBody([], [], opts);
    expect(body.messages).toEqual([]);
  });

  it("omits toolConfig when there are no tools", () => {
    const body = buildConverseBody([{ role: "user", content: "x" }], [], opts);
    expect(body.toolConfig).toBeUndefined();
  });

  it("serializes tools as toolSpec.inputSchema.json", () => {
    const tools: ToolDefinition[] = [
      { name: "t", description: "d", parameters: { type: "object" } },
    ];
    const body = buildConverseBody([{ role: "user", content: "x" }], tools, opts);
    expect(body.toolConfig).toEqual({
      tools: [{ toolSpec: { name: "t", description: "d", inputSchema: { json: { type: "object" } } } }],
    });
  });

  it("omits inferenceConfig when maxTokens is absent", () => {
    const body = buildConverseBody([{ role: "user", content: "x" }], [], { ...opts, maxTokens: undefined });
    expect(body.inferenceConfig).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildConverseBody — prompt caching
// ---------------------------------------------------------------------------

const CACHE = { cachePoint: { type: "default" } };
const cachingCaps = {
  explicitPromptCaching: true,
  toolCachePoint: true,
  reasoning: false,
  systemRoleSupported: true,
  userImageTypesSupported: [],
};

describe("buildConverseBody — prompt caching", () => {
  const tools: ToolDefinition[] = [{ name: "t", description: "d", parameters: {} }];

  it("adds checkpoints to tools, system and the last user message", () => {
    const messages: LLMMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ];
    const body = buildConverseBody(messages, tools, opts, cachingCaps);
    expect(last((body.toolConfig as { tools: unknown[] }).tools)).toEqual(CACHE);
    expect(last(body.system as unknown[])).toEqual(CACHE);
    const out = body.messages as { content: unknown[] }[];
    expect(last(last(out).content)).toEqual(CACHE);
  });

  it("adds the message checkpoint after a tool result", () => {
    const messages: LLMMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "do", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "t1", content: "result" },
    ];
    const body = buildConverseBody(messages, tools, opts, cachingCaps);
    const out = body.messages as { role: string; content: unknown[] }[];
    expect(last(out).role).toBe("user");
    expect(last(last(out).content)).toEqual(CACHE);
  });

  it("only adds a message checkpoint when there is no system or tools", () => {
    const body = buildConverseBody([{ role: "user", content: "x" }], [], opts, cachingCaps);
    expect(body.system).toBeUndefined();
    expect(body.toolConfig).toBeUndefined();
    const out = body.messages as { content: unknown[] }[];
    expect(out[0].content).toEqual([{ text: "x" }, CACHE]);
  });

  it("does not add a checkpoint when there are no messages", () => {
    const body = buildConverseBody([], tools, { ...opts }, cachingCaps);
    expect(body.messages).toEqual([]);
  });

  it("omits the tool checkpoint for models that reject it (e.g. Nova)", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "user", content: "u" }],
      tools,
      opts,
      { ...cachingCaps, toolCachePoint: false }
    );
    const list = (body.toolConfig as { tools: unknown[] }).tools;
    expect(list).toHaveLength(1);
    expect(last(list)).not.toEqual(CACHE);
    // System and message checkpoints are still applied.
    expect(last(body.system as unknown[])).toEqual(CACHE);
    const out = body.messages as { content: unknown[] }[];
    expect(last(last(out).content)).toEqual(CACHE);
  });

  it("does not add caching when the model does not support it", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      tools,
      opts,
      { ...cachingCaps, explicitPromptCaching: false }
    );
    expect(JSON.stringify(body)).not.toContain("cachePoint");
  });

  it("does not add caching when capabilities are unknown", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      tools,
      opts,
      undefined
    );
    expect(JSON.stringify(body)).not.toContain("cachePoint");
  });

  it("does not add caching when enableCache is false", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      tools,
      { ...opts, enableCache: false },
      cachingCaps
    );
    expect(JSON.stringify(body)).not.toContain("cachePoint");
  });
});

// ---------------------------------------------------------------------------
// parseConverseResponse
// ---------------------------------------------------------------------------

describe("parseConverseResponse", () => {
  it("extracts text and maps end_turn", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ text: "a" }, { text: "b" }] } },
      stopReason: "end_turn",
    });
    expect(res.content).toBe("ab");
    expect(res.toolCalls).toEqual([]);
    expect(res.finishReason).toBe("stop");
  });

  it("extracts multiple tool calls", () => {
    const res = parseConverseResponse({
      output: {
        message: {
          content: [
            { toolUse: { toolUseId: "t1", name: "a", input: { x: 1 } } },
            { toolUse: { toolUseId: "t2", name: "b", input: {} } },
          ],
        },
      },
      stopReason: "tool_use",
    });
    expect(res.toolCalls).toEqual([
      { id: "t1", type: "function", function: { name: "a", arguments: '{"x":1}' } },
      { id: "t2", type: "function", function: { name: "b", arguments: "{}" } },
    ]);
    expect(res.finishReason).toBe("tool_calls");
  });

  it("handles missing output and usage", () => {
    const res = parseConverseResponse({});
    expect(res.content).toBeNull();
    expect(res.toolCalls).toEqual([]);
    expect(res.usage).toBeUndefined();
    expect(res.finishReason).toBe("stop");
  });

  it("maps cache usage fields", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ text: "x" }] } },
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 100, cacheWriteInputTokens: 50 },
    });
    expect(res.usage).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      cachedTokens: 100,
      cacheWriteTokens: 50,
    });
  });

  it.each([
    ["end_turn", "stop"],
    ["stop_sequence", "stop"],
    ["tool_use", "tool_calls"],
    ["max_tokens", "length"],
    ["guardrail_intervened", "error"],
    ["content_filtered", "error"],
    ["something_new", "stop"],
    [undefined, "stop"],
  ])("maps stopReason %s to %s", (reason, expected) => {
    expect(parseConverseResponse({ stopReason: reason as string }).finishReason).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// chat — request shaping and errors
// ---------------------------------------------------------------------------

describe("BedrockProvider.chat", () => {
  it("posts to the region-derived endpoint with bearer auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      okJson({ output: { message: { content: [{ text: "ok" }] } }, stopReason: "end_turn" })
    );
    const res = await provider.chat([{ role: "user", content: "hi" }], [], opts);
    expect(res.content).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://bedrock-runtime.eu-north-1.amazonaws.com/model/nvidia.nemotron-super-3-120b/converse"
    );
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer bedrock-key",
      "Content-Type": "application/json",
    });
  });

  it("preserves colons in model IDs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat([{ role: "user", content: "hi" }], [], {
      ...opts,
      model: "anthropic.claude-haiku-4-5-20251001-v1:0",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/model/anthropic.claude-haiku-4-5-20251001-v1:0/converse"
    );
  });

  it("defaults to us-east-1 when no region is given", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, region: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toContain("bedrock-runtime.us-east-1.amazonaws.com");
  });

  it("merges custom headers without overriding auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat([{ role: "user", content: "hi" }], [], {
      ...opts,
      customHeaders: { "X-Custom": "yes", Authorization: "Bearer attacker" },
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Custom"]).toBe("yes");
    expect(headers.Authorization).toBe("Bearer bedrock-key");
  });

  it("routes through the proxy when requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, proxyRequests: true });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/proxy\//);
  });

  it("passes the abort signal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat([{ role: "user", content: "hi" }], [], { ...opts, signal: controller.signal });
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it("adds cache checkpoints when the model supports caching", async () => {
    registerCapabilities("cache.model", true);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      [{ name: "t", description: "d", parameters: {} }],
      { ...opts, model: "cache.model" }
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(JSON.stringify(body)).toContain("cachePoint");
  });

  it("does not add cache checkpoints for uncached models", async () => {
    registerCapabilities("plain.model", false);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      [],
      { ...opts, model: "plain.model" }
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(JSON.stringify(body)).not.toContain("cachePoint");
  });

  describe("error mapping", () => {
    it("explains account verification on 403", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        errJson(403, { message: "Your account is currently being verified." })
      );
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        /still being verified/
      );
    });

    it("explains generic 403 with region and permissions", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(403, { message: "AccessDeniedException" }));
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        /model access is enabled in eu-north-1/
      );
    });

    it("explains 404 as model unavailable in the region", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(404, { message: "not found" }));
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        /not found or not available in eu-north-1/
      );
    });

    it.each([400, 401, 408, 429, 500, 503])("includes the status for error %i", async (status) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(status, { message: "boom" }));
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        new RegExp(`Amazon Bedrock error ${status}`)
      );
    });

    it("falls back to raw text when the error body is not JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(500, "internal failure"));
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        /internal failure/
      );
    });

    it("reads the capital-M Message field", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(403, { Message: "AccessDenied" }));
      await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
        /model access is enabled/
      );
    });
  });
});

// ---------------------------------------------------------------------------
// chatStream
// ---------------------------------------------------------------------------

async function collectStream(
  chunks: Uint8Array[],
  overrides: Partial<ChatOptions> = {},
  tools: ToolDefinition[] = []
) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(streamFromChunks(chunks));
  const tokens: string[] = [];
  const reasoning: string[] = [];
  const calls: { id: string; name: string; args: string }[] = [];
  const finishes: (string | undefined)[] = [];
  await provider.chatStream(
    [{ role: "user", content: "hi" }],
    (t) => tokens.push(t),
    (tc) => calls.push({ id: tc.id, name: tc.function.name, args: tc.function.arguments }),
    tools,
    { ...opts, ...overrides },
    (t) => reasoning.push(t),
    (info) => finishes.push(info.finishReason)
  );
  return { tokens, reasoning, calls, finishes };
}

describe("BedrockProvider.chatStream", () => {
  it("streams text and reports stop", async () => {
    const { tokens, finishes } = await collectStream([
      frame({ messageStart: { role: "assistant" } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Hello" } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: " world" } } }),
      frame({ messageStop: { stopReason: "end_turn" } }),
      frame({ metadata: { usage: { inputTokens: 1, outputTokens: 2 } } }),
    ]);
    expect(tokens.join("")).toBe("Hello world");
    expect(finishes).toEqual(["stop"]);
  });

  it("maps max_tokens to length", async () => {
    const { finishes } = await collectStream([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "cut" } } }),
      frame({ messageStop: { stopReason: "max_tokens" } }),
    ]);
    expect(finishes).toEqual(["length"]);
  });

  it("forwards reasoning deltas", async () => {
    const { reasoning, tokens } = await collectStream([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: "think " } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: "more" } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "answer" } } }),
    ]);
    expect(reasoning.join("")).toBe("think more");
    expect(tokens.join("")).toBe("answer");
  });

  it("accumulates a single tool call across deltas", async () => {
    const { calls } = await collectStream([
      frame({ contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "t1", name: "do" } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"a":' } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: "1}" } } } }),
      frame({ contentBlockStop: { contentBlockIndex: 0 } }),
      frame({ messageStop: { stopReason: "tool_use" } }),
    ]);
    expect(calls).toEqual([{ id: "t1", name: "do", args: '{"a":1}' }]);
  });

  it("handles multiple interleaved tool calls", async () => {
    const { calls } = await collectStream([
      frame({ contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "a", name: "one" } } } }),
      frame({ contentBlockStart: { contentBlockIndex: 1, start: { toolUse: { toolUseId: "b", name: "two" } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"n":2}' } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"n":1}' } } } }),
      frame({ contentBlockStop: { contentBlockIndex: 0 } }),
      frame({ contentBlockStop: { contentBlockIndex: 1 } }),
    ]);
    expect(calls).toEqual([
      { id: "a", name: "one", args: '{"n":1}' },
      { id: "b", name: "two", args: '{"n":2}' },
    ]);
  });

  it("defaults tool arguments to {} when no input arrives", async () => {
    const { calls } = await collectStream([
      frame({ contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "t1", name: "noop" } } } }),
      frame({ contentBlockStop: { contentBlockIndex: 0 } }),
    ]);
    expect(calls).toEqual([{ id: "t1", name: "noop", args: "{}" }]);
  });

  it("reassembles frames split across reader chunks", async () => {
    const a = frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "split" } } });
    const b = frame({ messageStop: { stopReason: "end_turn" } });
    const { tokens, finishes } = await collectStream([
      a.subarray(0, 10),
      a.subarray(10),
      b.subarray(0, 3),
      b.subarray(3),
    ]);
    expect(tokens.join("")).toBe("split");
    expect(finishes).toEqual(["stop"]);
  });

  it("ignores unknown and empty frames", async () => {
    const { tokens, finishes } = await collectStream([
      frame({ messageStart: { role: "assistant" } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0 } }),
      frame({ futureEvent: { whatever: true } }),
      new Uint8Array(0),
    ]);
    expect(tokens).toEqual([]);
    expect(finishes).toEqual(["stop"]);
  });

  it.each([
    ["throttlingException", { throttlingException: { message: "slow down" } }],
    ["validationException", { validationException: { message: "bad input" } }],
    ["modelStreamErrorException", { modelStreamErrorException: { message: "model glitch" } }],
    ["internalServerException", { internalServerException: { message: "oops" } }],
    ["serviceUnavailableException", { serviceUnavailableException: { message: "busy" } }],
  ])("rejects on %s", async (type, payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamFromChunks([frame(payload, { ":message-type": "exception", ":exception-type": type })])
    );
    const finishes: (string | undefined)[] = [];
    await expect(
      provider.chatStream(
        [{ role: "user", content: "hi" }],
        () => {},
        () => {},
        [],
        opts,
        undefined,
        (info) => finishes.push(info.finishReason)
      )
    ).rejects.toThrow(new RegExp(type));
    expect(finishes).toEqual(["error"]);
  });

  it("reports error and throws when the HTTP response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(400, { message: "bad" }));
    const finishes: (string | undefined)[] = [];
    await expect(
      provider.chatStream([{ role: "user", content: "hi" }], () => {}, () => {}, [], opts, undefined, (i) =>
        finishes.push(i.finishReason)
      )
    ).rejects.toThrow(/Amazon Bedrock error 400/);
    expect(finishes).toEqual(["error"]);
  });

  it("reports error when the response has no body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);
    const finishes: (string | undefined)[] = [];
    await expect(
      provider.chatStream([{ role: "user", content: "hi" }], () => {}, () => {}, [], opts, undefined, (i) =>
        finishes.push(i.finishReason)
      )
    ).rejects.toThrow(/not streamable/);
    expect(finishes).toEqual(["error"]);
  });

  it("adds cache checkpoints when the model supports caching", async () => {
    registerCapabilities("cache.stream", true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(streamFromChunks([frame({ messageStop: {} })]));
    await provider.chatStream(
      [{ role: "system", content: "s" }, { role: "user", content: "x" }],
      () => {},
      () => {},
      [{ name: "t", description: "d", parameters: {} }],
      { ...opts, model: "cache.stream" }
    );
    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string);
    expect(JSON.stringify(body)).toContain("cachePoint");
  });
});

// ---------------------------------------------------------------------------
// listModels
// ---------------------------------------------------------------------------

describe("BedrockProvider.listModels", () => {
  it("returns discovered models and defaults the region", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/foundation-models")) {
        return okJson({ modelSummaries: [summary({ modelId: "nvidia.nemotron-super-3-120b", modelName: "Nemotron", providerName: "NVIDIA" })] });
      }
      return okJson({ inferenceProfileSummaries: [] });
    });
    const models = await provider.listModels("k", undefined, false);
    expect(models.map((m) => m.id)).toContain("nvidia.nemotron-super-3-120b");
    expect(vi.mocked(globalThis.fetch).mock.calls.every((c) => String(c[0]).includes("us-east-1"))).toBe(true);
  });

  it("honours an explicit region and the proxy option", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      urls.push(String(input));
      if (String(input).includes("/foundation-models")) {
        return okJson({ modelSummaries: [summary({ modelId: "m" })] });
      }
      return okJson({ inferenceProfileSummaries: [] });
    });
    await provider.listModels("k", undefined, true, "eu-north-1");
    expect(urls[0].startsWith("/proxy/")).toBe(true);
    expect(urls[0]).toContain(encodeURIComponent("https://bedrock.eu-north-1.amazonaws.com"));
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

function countCachePoints(body: unknown): number {
  return JSON.stringify(body).split('"cachePoint"').length - 1;
}

describe("buildConverseBody — cache checkpoint placement edge cases", () => {
  const tools: ToolDefinition[] = [{ name: "t", description: "d", parameters: {} }];
  const caps = { explicitPromptCaching: true, toolCachePoint: true, reasoning: false, systemRoleSupported: true, userImageTypesSupported: [] };

  it("uses exactly three checkpoints for system + tools + user", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "user", content: "u" }],
      tools,
      opts,
      caps
    );
    expect(countCachePoints(body)).toBe(3);
  });

  it("uses one checkpoint when there is only a user message", () => {
    const body = buildConverseBody([{ role: "user", content: "u" }], [], opts, caps);
    expect(countCachePoints(body)).toBe(1);
  });

  it("still caches system and tools when the last message is an assistant turn", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "s" }, { role: "assistant", content: "done" }],
      tools,
      opts,
      caps
    );
    expect(countCachePoints(body)).toBe(2); // tools + system, no message checkpoint
  });
});

describe("caching via the capability registry", () => {
  const tools: ToolDefinition[] = [{ name: "t", description: "d", parameters: {} }];

  it("engages caching for an inference-profile ID mapped to its base model", async () => {
    buildBedrockModelList(
      [summary({ modelId: "anthropic.claude-sonnet-4-6", inferenceTypesSupported: ["INFERENCE_PROFILE"], explicitPromptCaching: { isSupported: true } })],
      [{ inferenceProfileId: "eu.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: "/anthropic.claude-sonnet-4-6" }] }]
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat(
      [{ role: "system", content: "s" }, { role: "user", content: "u" }],
      tools,
      { ...opts, model: "eu.anthropic.claude-sonnet-4-6" }
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(countCachePoints(body)).toBe(3);
  });

  it("does not cache a manually typed model that was never discovered", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson({}));
    await provider.chat(
      [{ role: "system", content: "s" }, { role: "user", content: "u" }],
      tools,
      { ...opts, model: "custom.unknown-model" }
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(countCachePoints(body)).toBe(0);
  });
});

describe("chatStream — more edge cases", () => {
  it("does not emit an empty text delta", async () => {
    const { tokens } = await collectStream([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "" } } }),
    ]);
    expect(tokens).toEqual([]);
  });

  it("defaults missing tool identifiers to empty strings", async () => {
    const { calls } = await collectStream([
      frame({ contentBlockStart: { contentBlockIndex: 0, start: { toolUse: {} } } }),
      frame({ contentBlockStop: { contentBlockIndex: 0 } }),
    ]);
    expect(calls).toEqual([{ id: "", name: "", args: "{}" }]);
  });

  it("ignores contentBlockStop for an unknown index", async () => {
    const { calls } = await collectStream([frame({ contentBlockStop: { contentBlockIndex: 9 } })]);
    expect(calls).toEqual([]);
  });

  it("tolerates metadata without usage", async () => {
    const { finishes } = await collectStream([frame({ metadata: {} })]);
    expect(finishes).toEqual(["stop"]);
  });

  it("does not throw when no reasoning callback is supplied", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamFromChunks([
        frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: "think" } } } }),
        frame({ messageStop: { stopReason: "end_turn" } }),
      ])
    );
    await expect(
      provider.chatStream([{ role: "user", content: "hi" }], () => {}, () => {}, [], opts)
    ).resolves.toBeUndefined();
  });
});

describe("parseConverseResponse — more edge cases", () => {
  it("falls back to a generated id when toolUseId is missing", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ toolUse: { name: "x" } }] } },
      stopReason: "tool_use",
    });
    expect(res.toolCalls[0].id).toBe("bedrock_call_0");
    expect(res.toolCalls[0].function.arguments).toBe("{}");
  });
});

describe("buildConverseBody — more message edge cases", () => {
  it("treats a null user content as an empty string", () => {
    const body = buildConverseBody([{ role: "user", content: null }], [], opts);
    expect((body.messages as { content: unknown[] }[])[0].content).toEqual([{ text: "" }]);
  });

  it("writes an empty toolUseId when a tool result has no call id", () => {
    const body = buildConverseBody([{ role: "tool", content: "r" }], [], opts);
    const msg = (body.messages as { content: { toolResult: { toolUseId: string } }[] }[])[0];
    expect(msg.content[0].toolResult.toolUseId).toBe("");
  });
});

describe("BedrockProvider.chat — more error mapping", () => {
  it("detects account verification in a non-JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(403, "Your account is currently being verified."));
    await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
      /still being verified/
    );
  });

  it("reads the capital-M Message field on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errJson(404, { Message: "ResourceNotFound" }));
    await expect(provider.chat([{ role: "user", content: "x" }], [], opts)).rejects.toThrow(
      /not found or not available/
    );
  });
});
