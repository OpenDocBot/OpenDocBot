import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  BedrockProvider,
  buildConverseBody,
  parseConverseResponse,
} from "../../providers/bedrock";
import {
  clearBedrockModelCache,
  buildBedrockModelList,
} from "../../lib/bedrockModels";
import type { ChatOptions, LLMMessage, ToolDefinition } from "../../providers/types";

const provider = new BedrockProvider();
const encoder = new TextEncoder();

const baseOpts: ChatOptions = {
  apiKey: "k",
  model: "m",
  region: "us-east-1",
  maxTokens: 64,
};

const cachingCaps = {
  explicitPromptCaching: true,
  reasoning: false,
  systemRoleSupported: true,
  userImageTypesSupported: [],
};

beforeEach(() => clearBedrockModelCache());
afterEach(() => vi.restoreAllMocks());

function countCachePoints(body: unknown): number {
  return JSON.stringify(body).split('"cachePoint"').length - 1;
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

// ---------------------------------------------------------------------------
// Caching matrix
// ---------------------------------------------------------------------------

describe("caching matrix (system x tools x enableCache x capability)", () => {
  const tools: ToolDefinition[] = [{ name: "t", description: "d", parameters: {} }];

  const userCases: [boolean, boolean, boolean | undefined, boolean | undefined, number][] = [
    [true, true, undefined, true, 3],
    [true, true, true, true, 3],
    [true, false, undefined, true, 2],
    [false, true, undefined, true, 2],
    [false, false, undefined, true, 1],
    [true, false, true, true, 2],
    [false, true, true, true, 2],
    [true, true, false, true, 0],
    [true, true, undefined, false, 0],
    [true, true, true, false, 0],
    [true, true, undefined, undefined, 0],
    [true, true, true, undefined, 0],
    [false, false, false, true, 0],
    [false, false, undefined, false, 0],
  ];

  it.each(userCases)(
    "system=%s tools=%s enableCache=%s cap=%s -> %i checkpoints",
    (hasSystem, hasTools, enableCache, cap, expected) => {
      const messages: LLMMessage[] = [];
      if (hasSystem) messages.push({ role: "system", content: "sys" });
      messages.push({ role: "user", content: "hi" });
      const body = buildConverseBody(
        messages,
        hasTools ? tools : [],
        { ...baseOpts, enableCache },
        cap === undefined ? undefined : { ...cachingCaps, explicitPromptCaching: cap }
      );
      expect(countCachePoints(body)).toBe(expected);
    }
  );

  const assistantCases: [boolean, boolean, number][] = [
    [true, true, 2],
    [true, false, 1],
    [false, true, 1],
    [false, false, 0],
  ];

  it.each(assistantCases)(
    "assistant last turn system=%s tools=%s -> %i checkpoints",
    (hasSystem, hasTools, expected) => {
      const messages: LLMMessage[] = [];
      if (hasSystem) messages.push({ role: "system", content: "sys" });
      messages.push({ role: "assistant", content: "done" });
      const body = buildConverseBody(messages, hasTools ? tools : [], baseOpts, cachingCaps);
      expect(countCachePoints(body)).toBe(expected);
    }
  );
});

describe("cache checkpoint placement", () => {
  const tools: ToolDefinition[] = [{ name: "t", description: "d", parameters: {} }];

  it("puts the system checkpoint last in the system array", () => {
    const body = buildConverseBody(
      [{ role: "system", content: "a" }, { role: "system", content: "b" }, { role: "user", content: "u" }],
      [],
      baseOpts,
      cachingCaps
    );
    const system = body.system as unknown[];
    expect(last(system)).toEqual({ cachePoint: { type: "default" } });
    expect(system).toHaveLength(3);
  });

  it("puts the tools checkpoint last in the tools array", () => {
    const body = buildConverseBody(
      [{ role: "user", content: "u" }],
      [tools[0], { name: "t2", description: "d2", parameters: {} }],
      baseOpts,
      cachingCaps
    );
    const list = (body.toolConfig as { tools: unknown[] }).tools;
    expect(last(list)).toEqual({ cachePoint: { type: "default" } });
    expect(list).toHaveLength(3);
  });

  it("only checkpoints the last message, not earlier ones", () => {
    const body = buildConverseBody(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
      [],
      baseOpts,
      cachingCaps
    );
    const out = body.messages as { role: string; content: unknown[] }[];
    expect(out).toHaveLength(3);
    expect(out[0].content).toEqual([{ text: "first" }]);
    expect(out[1].content).toEqual([{ text: "reply" }]);
    expect(last(out[2].content)).toEqual({ cachePoint: { type: "default" } });
  });
});

// ---------------------------------------------------------------------------
// parseConverseResponse content matrix
// ---------------------------------------------------------------------------

describe("parseConverseResponse content matrix", () => {
  it("concatenates multiple text blocks", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ text: "a" }, { text: "b" }, { text: "c" }] } },
    });
    expect(res.content).toBe("abc");
  });

  it("ignores reasoning content blocks in the text output", () => {
    const res = parseConverseResponse({
      output: {
        message: {
          content: [
            { reasoningContent: { reasoningText: { text: "hidden" } } },
            { text: "visible" },
          ],
        },
      },
    });
    expect(res.content).toBe("visible");
  });

  it("returns null content when there are no text blocks", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ toolUse: { toolUseId: "t", name: "x", input: {} } }] } },
      stopReason: "tool_use",
    });
    expect(res.content).toBeNull();
  });

  it("returns empty tool calls for an empty content array", () => {
    const res = parseConverseResponse({ output: { message: { content: [] } } });
    expect(res.toolCalls).toEqual([]);
  });

  it("serializes undefined tool input as {}", () => {
    const res = parseConverseResponse({
      output: { message: { content: [{ toolUse: { toolUseId: "t", name: "x" } }] } },
      stopReason: "tool_use",
    });
    expect(res.toolCalls[0].function.arguments).toBe("{}");
  });

  it("keeps an empty text but reports null when nothing else", () => {
    const res = parseConverseResponse({ output: { message: { content: [{ text: "" }] } } });
    expect(res.content).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error mapping matrix
// ---------------------------------------------------------------------------

describe("chat error matrix", () => {
  function errResponse(status: number, body: unknown): Response {
    return {
      ok: false,
      status,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as Response;
  }

  const cases: [number, unknown, RegExp][] = [
    [400, { message: "ValidationException" }, /Amazon Bedrock error 400/],
    [401, { message: "unauthorized" }, /Amazon Bedrock error 401/],
    [403, { message: "being verified" }, /still being verified/],
    [403, { message: "AccessDeniedException" }, /model access is enabled in us-east-1/],
    [403, "Account is currently being verified.", /still being verified/],
    [404, { message: "ResourceNotFound" }, /not found or not available/],
    [404, { Message: "ResourceNotFound" }, /not found or not available/],
    [408, { message: "timeout" }, /Amazon Bedrock error 408/],
    [429, { message: "ThrottlingException" }, /Amazon Bedrock error 429/],
    [500, { message: "InternalServerException" }, /Amazon Bedrock error 500/],
    [503, { message: "ServiceUnavailableException" }, /Amazon Bedrock error 503/],
    [500, "plain text failure", /plain text failure/],
  ];

  it.each(cases)("status %i maps to the expected message", async (status, body, expected) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(errResponse(status, body));
    await expect(provider.chat([{ role: "user", content: "x" }], [], baseOpts)).rejects.toThrow(expected);
  });
});

// ---------------------------------------------------------------------------
// chatStream event matrix
// ---------------------------------------------------------------------------

function frame(payload: unknown, headers: Record<string, string> = { ":message-type": "event" }): Uint8Array {
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const headerParts: number[] = [];
  for (const [key, value] of Object.entries(headers)) {
    const name = encoder.encode(key);
    const val = encoder.encode(value);
    headerParts.push(name.length, ...name, 7, (val.length >> 8) & 0xff, val.length & 0xff, ...val);
  }
  const headerBytes = new Uint8Array(headerParts);
  const total = 12 + headerBytes.length + payloadBytes.length + 4;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headerBytes.length);
  buf.set(headerBytes, 12);
  buf.set(payloadBytes, 12 + headerBytes.length);
  return buf;
}

function stream(frames: Uint8Array[]): Response {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const f of frames) controller.enqueue(f);
        controller.close();
      },
    }),
  } as unknown as Response;
}

async function run(frames: Uint8Array[]) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(frames));
  const tokens: string[] = [];
  const reasoning: string[] = [];
  const calls: { id: string; name: string; args: string }[] = [];
  const finishes: (string | undefined)[] = [];
  await provider.chatStream(
    [{ role: "user", content: "hi" }],
    (t) => tokens.push(t),
    (tc) => calls.push({ id: tc.id, name: tc.function.name, args: tc.function.arguments }),
    [],
    baseOpts,
    (t) => reasoning.push(t),
    (i) => finishes.push(i.finishReason)
  );
  return { tokens, reasoning, calls, finishes };
}

describe("chatStream event matrix", () => {
  it("messageStart alone produces no output and finishes stop", async () => {
    const { tokens, calls, finishes } = await run([frame({ messageStart: { role: "assistant" } })]);
    expect(tokens).toEqual([]);
    expect(calls).toEqual([]);
    expect(finishes).toEqual(["stop"]);
  });

  it("contentBlockDelta text appends in order", async () => {
    const { tokens } = await run([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "a" } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "b" } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "c" } } }),
    ]);
    expect(tokens).toEqual(["a", "b", "c"]);
  });

  it("reasoning and text deltas are routed separately", async () => {
    const { tokens, reasoning } = await run([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { reasoningContent: { text: "r" } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "t" } } }),
    ]);
    expect(reasoning).toEqual(["r"]);
    expect(tokens).toEqual(["t"]);
  });

  it("toolUse input without a preceding start is ignored", async () => {
    const { calls } = await run([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"x":1}' } } } }),
      frame({ contentBlockStop: { contentBlockIndex: 0 } }),
    ]);
    expect(calls).toEqual([]);
  });

  it("contentBlockStop without a start emits nothing", async () => {
    const { calls } = await run([frame({ contentBlockStop: { contentBlockIndex: 3 } })]);
    expect(calls).toEqual([]);
  });

  it("messageStop max_tokens maps to length", async () => {
    const { finishes } = await run([frame({ messageStop: { stopReason: "max_tokens" } })]);
    expect(finishes).toEqual(["length"]);
  });

  it("messageStop guardrail_intervened maps to error", async () => {
    const { finishes } = await run([frame({ messageStop: { stopReason: "guardrail_intervened" } })]);
    expect(finishes).toEqual(["error"]);
  });

  it("messageStop content_filtered maps to error", async () => {
    const { finishes } = await run([frame({ messageStop: { stopReason: "content_filtered" } })]);
    expect(finishes).toEqual(["error"]);
  });

  it("metadata usage is tolerated without a finish callback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      stream([frame({ metadata: { usage: { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3 } } })])
    );
    await expect(provider.chatStream([{ role: "user", content: "hi" }], () => {}, () => {}, [], baseOpts)).resolves.toBeUndefined();
  });

  it("a text block followed by a tool block in one message", async () => {
    const { tokens, calls } = await run([
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "let me check" } } }),
      frame({ contentBlockStart: { contentBlockIndex: 1, start: { toolUse: { toolUseId: "t1", name: "lookup" } } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: "{}" } } } }),
      frame({ contentBlockStop: { contentBlockIndex: 1 } }),
    ]);
    expect(tokens.join("")).toBe("let me check");
    expect(calls).toEqual([{ id: "t1", name: "lookup", args: "{}" }]);
  });
});

// ---------------------------------------------------------------------------
// Discovery naming / capability matrix
// ---------------------------------------------------------------------------

describe("discovery naming matrix", () => {
  it.each([
    ["us.anthropic.claude-sonnet-4-6", "(US)"],
    ["eu.anthropic.claude-sonnet-4-6", "(EU)"],
    ["global.anthropic.claude-sonnet-4-6", "(GLOBAL)"],
    ["apac.anthropic.claude-sonnet-4-6", "(APAC)"],
    ["jp.anthropic.claude-sonnet-4-6", "(JP)"],
    ["au.anthropic.claude-sonnet-4-6", "(AU)"],
  ])("labels profile %s as %s", (profileId, label) => {
    const list = buildBedrockModelList(
      [
        {
          modelId: "anthropic.claude-sonnet-4-6",
          modelName: "Claude Sonnet",
          providerName: "Anthropic",
          outputModalities: ["TEXT"],
          modelLifecycle: { status: "ACTIVE" },
          inferenceTypesSupported: ["INFERENCE_PROFILE"],
          inferenceAPIsSupported: { converse: { sync: true } },
          converse: { systemRoleSupported: true },
        },
      ],
      [{ inferenceProfileId: profileId, status: "ACTIVE", models: [{ modelArn: "/anthropic.claude-sonnet-4-6" }] }]
    );
    expect(list[0].id).toBe(profileId);
    expect(list[0].name).toContain(label);
  });

  it("falls back to the raw id for an unknown profile prefix", () => {
    const list = buildBedrockModelList(
      [
        {
          modelId: "m",
          modelName: "M",
          providerName: "P",
          outputModalities: ["TEXT"],
          modelLifecycle: { status: "ACTIVE" },
          inferenceTypesSupported: ["INFERENCE_PROFILE"],
          inferenceAPIsSupported: { converse: { sync: true } },
          converse: { systemRoleSupported: true },
        },
      ],
      [{ inferenceProfileId: "custom.m", status: "ACTIVE", models: [{ modelArn: "/m" }] }]
    );
    expect(list[0].name).toContain("(custom.m)");
  });

  it("sorts by provider and then name", () => {
    const list = buildBedrockModelList(
      [
        { modelId: "z", modelName: "Z", providerName: "Beta", outputModalities: ["TEXT"], modelLifecycle: { status: "ACTIVE" }, inferenceTypesSupported: ["ON_DEMAND"], inferenceAPIsSupported: { converse: { sync: true } }, converse: {} },
        { modelId: "a", modelName: "A", providerName: "Beta", outputModalities: ["TEXT"], modelLifecycle: { status: "ACTIVE" }, inferenceTypesSupported: ["ON_DEMAND"], inferenceAPIsSupported: { converse: { sync: true } }, converse: {} },
        { modelId: "m", modelName: "M", providerName: "Alpha", outputModalities: ["TEXT"], modelLifecycle: { status: "ACTIVE" }, inferenceTypesSupported: ["ON_DEMAND"], inferenceAPIsSupported: { converse: { sync: true } }, converse: {} },
      ],
      []
    );
    expect(list.map((m) => m.id)).toEqual(["m", "a", "z"]);
  });
});
