import { describe, it, expect } from "vitest";
import {
  isConfigured,
  getPresetInfo,
  getConfigSource,
  getEffectiveConfig,
  getForcedKeys,
  type ConfigSource,
} from "../../lib/effectiveConfig";
import type { ProviderConfig } from "../../store/settingsStore";

function makeConfig(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    presetId: "custom",
    providerId: "openaicompat",
    apiKey: "",
    model: "",
    baseUrl: "",
    maxTokens: 4096,
    enableCache: true,
    recacheThreshold: 2000,
    useLegacyChatCompletions: false,
    reasoningEffort: "",
    proxyRequests: false,
    anthropicCacheTtl: "5m",
    humanInTheLoop: false,
    suggestionMode: false,
    maxIterations: 100,
    customInstructions: "",
    openRouterRegion: "global",
    bedrockRegion: "us-east-1",
    ocrLanguage: "eng",
    ...overrides,
  };
}

describe("effectiveConfig — isConfigured", () => {
  it("returns false for an empty default config", () => {
    expect(isConfigured(makeConfig({}))).toBe(false);
  });

  it("returns false for a key-requiring preset without a key", () => {
    // OpenAI preset requires a key, even though the provider requiresKey=false.
    expect(
      isConfigured(
        makeConfig({
          presetId: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          apiKey: "",
        })
      )
    ).toBe(false);
  });

  it("returns true for a key-requiring preset with a key", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6-luna",
          apiKey: "sk-test",
        })
      )
    ).toBe(true);
  });

  it("returns true for a no-key preset (Ollama) without a key", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "ollama",
          baseUrl: "http://localhost:11434/v1",
          model: "llama3.1",
          apiKey: "",
        })
      )
    ).toBe(true);
  });

  it("returns false for a custom preset without a base URL", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "custom",
          baseUrl: "",
          model: "my-model",
          apiKey: "sk-test",
        })
      )
    ).toBe(false);
  });

  it("returns true for a custom preset with only a base URL (no model, no key)", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "custom",
          baseUrl: "https://example.com/v1",
          model: "",
          apiKey: "",
        })
      )
    ).toBe(true);
  });

  it("returns true for a custom preset with a base URL and model but no key", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "custom",
          baseUrl: "https://example.com/v1",
          model: "my-model",
          apiKey: "",
        })
      )
    ).toBe(true);
  });

  it("returns true for a fully populated custom preset", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "custom",
          baseUrl: "https://example.com/v1",
          model: "my-model",
          apiKey: "sk-test",
        })
      )
    ).toBe(true);
  });

  it("returns false when model is missing", () => {
    expect(
      isConfigured(
        makeConfig({
          presetId: "openai",
          baseUrl: "https://api.openai.com/v1",
          model: "",
          apiKey: "sk-test",
        })
      )
    ).toBe(false);
  });
});

describe("effectiveConfig — preset resolution", () => {
  it("prefers an explicit presetId over URL matching", () => {
    const info = getPresetInfo(
      makeConfig({
        presetId: "openai",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.1",
      })
    );
    expect(info.presetId).toBe("openai");
  });

  it("falls back to URL matching when presetId is unknown", () => {
    const info = getPresetInfo(
      makeConfig({
        presetId: "does-not-exist",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.1",
      })
    );
    expect(info.presetId).toBe("ollama");
  });
});

describe("effectiveConfig — config source", () => {
  it("is local today", () => {
    expect(getConfigSource()).toBe("local" satisfies ConfigSource);
  });

  it("getEffectiveConfig returns the config unchanged", () => {
    const cfg = makeConfig({ apiKey: "sk-test" });
    expect(getEffectiveConfig(cfg)).toBe(cfg);
  });
});

describe("effectiveConfig — managed merge", () => {
  it("forces present keys and keeps absent ones from local", () => {
    const local = makeConfig({ apiKey: "local-key", model: "local-model", maxTokens: 4096 });
    const managed = { apiKey: "managed-key", maxTokens: 8192 } as const;
    const eff = getEffectiveConfig(local, managed);
    expect(eff.apiKey).toBe("managed-key");
    expect(eff.maxTokens).toBe(8192);
    expect(eff.model).toBe("local-model");
  });

  it("getForcedKeys lists only the managed keys", () => {
    expect(getForcedKeys({ apiKey: "x", baseUrl: "y" })).toEqual(["apiKey", "baseUrl"]);
    expect(getForcedKeys(null)).toEqual([]);
    expect(getForcedKeys({})).toEqual([]);
  });

  it("reports managed as the source when forced keys exist", () => {
    expect(getConfigSource({ apiKey: "x" })).toBe("managed" satisfies ConfigSource);
    expect(getConfigSource({})).toBe("local" satisfies ConfigSource);
    expect(getConfigSource(null)).toBe("local" satisfies ConfigSource);
  });
});
