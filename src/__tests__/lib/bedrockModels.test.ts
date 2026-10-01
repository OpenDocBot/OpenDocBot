import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  buildBedrockModelList,
  discoverBedrockModels,
  getBedrockCapabilities,
  clearBedrockModelCache,
  FALLBACK_BEDROCK_MODELS,
} from "../../lib/bedrockModels";

function fm(partial: Record<string, unknown>) {
  return {
    modelId: "x",
    modelName: "X",
    providerName: "Prov",
    inputModalities: ["TEXT"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    inferenceTypesSupported: ["ON_DEMAND"],
    modelLifecycle: { status: "ACTIVE" },
    inferenceAPIsSupported: { converse: { sync: true, streaming: true } },
    explicitPromptCaching: { isSupported: false },
    converse: {
      maxTokensMaximum: 4096,
      systemRoleSupported: true,
      userImageTypesSupported: [],
      reasoningSupported: null,
    },
    ...partial,
  };
}

const ARN = "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6";

beforeEach(() => clearBedrockModelCache());
afterEach(() => vi.restoreAllMocks());

describe("buildBedrockModelList — filtering", () => {
  it("keeps only active, text-output, Converse-capable models", () => {
    const list = buildBedrockModelList(
      [
        fm({ modelId: "a.on-demand", modelName: "OnDemand", providerName: "A" }),
        fm({ modelId: "b.not-converse", inferenceAPIsSupported: {} }),
        fm({ modelId: "c.inactive", modelLifecycle: { status: "LEGACY" } }),
        fm({ modelId: "d.embedding", outputModalities: ["EMBEDDING"] }),
        fm({ modelId: "e.stream-only", inferenceAPIsSupported: { converse: { streaming: true } } }),
      ],
      []
    );
    expect(list.map((m) => m.id)).toEqual(["a.on-demand", "e.stream-only"]);
  });

  it("accepts a lowercase lifecycle status", () => {
    const list = buildBedrockModelList([fm({ modelId: "a", modelLifecycle: { status: "active" } })], []);
    expect(list.map((m) => m.id)).toEqual(["a"]);
  });

  it("tolerates missing optional fields", () => {
    const list = buildBedrockModelList(
      [
        {
          modelId: "bare",
          inferenceAPIsSupported: { converse: { sync: true } },
          modelLifecycle: { status: "ACTIVE" },
          outputModalities: ["TEXT"],
        } as never,
      ],
      []
    );
    expect(list.map((m) => m.id)).toEqual(["bare"]);
  });
});

describe("buildBedrockModelList — inference profiles", () => {
  it("maps inference-profile-only models to their profile IDs with a geo label", () => {
    const list = buildBedrockModelList(
      [
        fm({
          modelId: "anthropic.claude-sonnet-4-6",
          modelName: "Claude Sonnet 4.6",
          providerName: "Anthropic",
          inferenceTypesSupported: ["INFERENCE_PROFILE"],
          explicitPromptCaching: { isSupported: true },
        }),
      ],
      [
        { inferenceProfileId: "eu.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: ARN }] },
        { inferenceProfileId: "us.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: ARN }] },
      ]
    );
    expect(list.map((m) => m.id).sort()).toEqual([
      "eu.anthropic.claude-sonnet-4-6",
      "us.anthropic.claude-sonnet-4-6",
    ]);
    expect(list.find((m) => m.id.startsWith("eu."))?.name).toContain("(EU)");
  });

  it("offers both the base ID and profiles when the model is on-demand", () => {
    const list = buildBedrockModelList(
      [fm({ modelId: "m", inferenceTypesSupported: ["ON_DEMAND", "INFERENCE_PROFILE"] })],
      [{ inferenceProfileId: "global.m", status: "ACTIVE", models: [{ modelArn: "/m" }] }]
    );
    expect(list.map((m) => m.id).sort()).toEqual(["global.m", "m"]);
  });

  it("ignores profiles whose status is not ACTIVE", () => {
    const list = buildBedrockModelList(
      [fm({ modelId: "m", inferenceTypesSupported: ["INFERENCE_PROFILE"] })],
      [{ inferenceProfileId: "eu.m", status: "CREATING", models: [{ modelArn: "/m" }] }]
    );
    // No active profile and no on-demand: base ID is surfaced as a last resort.
    expect(list.map((m) => m.id)).toEqual(["m"]);
  });

  it("falls back to the base ID when neither on-demand nor a profile matches", () => {
    const list = buildBedrockModelList([fm({ modelId: "z.base", inferenceTypesSupported: [] })], []);
    expect(list.map((m) => m.id)).toEqual(["z.base"]);
  });

  it("deduplicates IDs and sorts by provider then name", () => {
    const list = buildBedrockModelList(
      [
        fm({ modelId: "b", modelName: "Bee", providerName: "Zeta" }),
        fm({ modelId: "a", modelName: "Ay", providerName: "Alpha" }),
        fm({ modelId: "a", modelName: "Ay", providerName: "Alpha" }),
      ],
      []
    );
    expect(list.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("buildBedrockModelList — capabilities", () => {
  it("registers capabilities for the base ID and each profile ID", () => {
    buildBedrockModelList(
      [
        fm({
          modelId: "anthropic.claude-sonnet-4-6",
          inferenceTypesSupported: ["INFERENCE_PROFILE"],
          explicitPromptCaching: { isSupported: true },
          converse: { reasoningSupported: { embedded: false }, maxTokensMaximum: 128000, systemRoleSupported: true, userImageTypesSupported: ["png"] },
        }),
      ],
      [{ inferenceProfileId: "eu.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: ARN }] }]
    );
    const base = getBedrockCapabilities("anthropic.claude-sonnet-4-6");
    const profile = getBedrockCapabilities("eu.anthropic.claude-sonnet-4-6");
    expect(base?.explicitPromptCaching).toBe(true);
    expect(base?.reasoning).toBe(true);
    expect(base?.maxTokensMaximum).toBe(128000);
    expect(profile).toEqual(base);
  });

  it("reports caching and reasoning as false when unsupported", () => {
    buildBedrockModelList(
      [
        fm({
          modelId: "nvidia.nemotron-super-3-120b",
          explicitPromptCaching: { isSupported: false },
          converse: { reasoningSupported: null },
        }),
      ],
      []
    );
    const caps = getBedrockCapabilities("nvidia.nemotron-super-3-120b");
    expect(caps?.explicitPromptCaching).toBe(false);
    expect(caps?.reasoning).toBe(false);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("discoverBedrockModels", () => {
  it("uses the control plane, sends bearer auth, and paginates", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
      if (url.includes("/foundation-models")) {
        if (url.includes("nextToken=page2")) {
          return jsonResponse({ modelSummaries: [fm({ modelId: "second", modelName: "Second" })] });
        }
        return jsonResponse({ modelSummaries: [fm({ modelId: "first", modelName: "First" })], nextToken: "page2" });
      }
      return jsonResponse({ inferenceProfileSummaries: [] });
    });

    const list = await discoverBedrockModels({ apiKey: "k", region: "us-east-1" });
    expect(list.map((m) => m.id).sort()).toEqual(["first", "second"]);
    expect(calls.filter((u) => u.includes("/foundation-models"))).toHaveLength(2);
  });

  it("still succeeds when inference profiles fail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/foundation-models")) {
        return jsonResponse({ modelSummaries: [fm({ modelId: "only", modelName: "Only" })] });
      }
      return { ok: false, status: 500, text: async () => "boom" } as Response;
    });
    const list = await discoverBedrockModels({ apiKey: "k", region: "us-east-1" });
    expect(list.map((m) => m.id)).toEqual(["only"]);
  });

  it("falls back to Mantle when the control plane returns nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("bedrock-mantle")) {
        return jsonResponse({ data: [{ id: "mistral.ministral-3-8b-instruct" }] });
      }
      return jsonResponse({ modelSummaries: [], inferenceProfileSummaries: [] });
    });
    const list = await discoverBedrockModels({ apiKey: "k", region: "eu-north-1" });
    expect(list.map((m) => m.id)).toEqual(["mistral.ministral-3-8b-instruct"]);
  });

  it("clears capabilities when the fallback path is used", async () => {
    buildBedrockModelList([fm({ modelId: "stale", explicitPromptCaching: { isSupported: true } })], []);
    expect(getBedrockCapabilities("stale")?.explicitPromptCaching).toBe(true);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("bedrock-mantle")) return jsonResponse({ data: [{ id: "m" }] });
      return jsonResponse({ modelSummaries: [], inferenceProfileSummaries: [] });
    });
    await discoverBedrockModels({ apiKey: "k", region: "eu-north-1" });
    expect(getBedrockCapabilities("stale")).toBeUndefined();
  });

  it("returns the static fallback when everything fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    } as Response);
    const list = await discoverBedrockModels({ apiKey: "k", region: "us-east-1" });
    expect(list).toEqual(FALLBACK_BEDROCK_MODELS);
  });

  it("routes through the /proxy/ path when requested", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      urls.push(String(input));
      return jsonResponse({ modelSummaries: [fm({ modelId: "x" })], inferenceProfileSummaries: [] });
    });
    await discoverBedrockModels({ apiKey: "k", region: "us-east-1", proxyRequests: true });
    expect(urls[0].startsWith("/proxy/")).toBe(true);
  });
});

describe("discoverBedrockModels — more edge cases", () => {
  it("paginates inference profiles too", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/foundation-models")) {
        return jsonResponse({ modelSummaries: [fm({ modelId: "anthropic.claude-sonnet-4-6", inferenceTypesSupported: ["INFERENCE_PROFILE"] })] });
      }
      if (url.includes("nextToken=prof2")) {
        return jsonResponse({ inferenceProfileSummaries: [{ inferenceProfileId: "us.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: "/anthropic.claude-sonnet-4-6" }] }] });
      }
      return jsonResponse({ inferenceProfileSummaries: [{ inferenceProfileId: "eu.anthropic.claude-sonnet-4-6", status: "ACTIVE", models: [{ modelArn: "/anthropic.claude-sonnet-4-6" }] }], nextToken: "prof2" });
    });
    const list = await discoverBedrockModels({ apiKey: "k", region: "us-east-1" });
    expect(list.map((m) => m.id).sort()).toEqual([
      "eu.anthropic.claude-sonnet-4-6",
      "us.anthropic.claude-sonnet-4-6",
    ]);
    expect(urls.filter((u) => u.includes("/inference-profiles"))).toHaveLength(2);
  });

  it("passes the abort signal to fetch", async () => {
    const controller = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_i: unknown, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return jsonResponse({ modelSummaries: [fm({ modelId: "m" })], inferenceProfileSummaries: [] });
    });
    await discoverBedrockModels({ apiKey: "k", region: "us-east-1", signal: controller.signal });
    expect(signals.every((s) => s === controller.signal)).toBe(true);
  });

  it("falls back to the static list when both endpoints return empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("bedrock-mantle")) return jsonResponse({ data: [] });
      return jsonResponse({ modelSummaries: [], inferenceProfileSummaries: [] });
    });
    const list = await discoverBedrockModels({ apiKey: "k", region: "us-east-1" });
    expect(list).toEqual(FALLBACK_BEDROCK_MODELS);
  });
});

describe("buildBedrockModelList — naming edge cases", () => {
  it("omits the provider prefix when providerName is missing", () => {
    const list = buildBedrockModelList(
      [{ modelId: "m", modelName: "Model", providerName: "", outputModalities: ["TEXT"], modelLifecycle: { status: "ACTIVE" }, inferenceTypesSupported: ["ON_DEMAND"], inferenceAPIsSupported: { converse: { sync: true } }, converse: {} }],
      []
    );
    expect(list[0].name).toBe("Model");
  });

  it("ignores profiles with no models array", () => {
    const list = buildBedrockModelList(
      [fm({ modelId: "m", inferenceTypesSupported: ["INFERENCE_PROFILE"] })],
      [{ inferenceProfileId: "eu.m", status: "ACTIVE" }]
    );
    expect(list.map((m) => m.id)).toEqual(["m"]);
  });

  it("keeps a model whose input modalities are not text but output is", () => {
    const list = buildBedrockModelList(
      [fm({ modelId: "vision", inputModalities: ["TEXT", "IMAGE"], outputModalities: ["TEXT"] })],
      []
    );
    expect(list.map((m) => m.id)).toEqual(["vision"]);
  });
});
