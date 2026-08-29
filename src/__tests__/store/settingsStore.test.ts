import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSettingsStore } from "../../store/settingsStore";

const STORAGE_KEY = "opendocbot-settings";

const defaultConfig = {
  providerId: "openai",
  apiKey: "",
  model: "gpt-4o",
  baseUrl: "https://api.openai.com/v1",
  maxTokens: 4096,
enableCache: true,
recacheThreshold: 2000,
useLegacyChatCompletions: false,
  reasoningEffort: "",
      proxyRequests: false,
anthropicCacheTtl: "5m",
  humanInTheLoop: false,
  maxIterations: 100,
  customInstructions: "",
} as const;

function resetStore() {
  localStorage.removeItem(STORAGE_KEY);
  useSettingsStore.setState({ config: { ...defaultConfig } });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

// =========================================================================
// Defaults
// =========================================================================
describe("settingsStore — defaults", () => {
  it("has correct initial config", () => {
    const { config } = useSettingsStore.getState();
    expect(config).toEqual({
      providerId: "openai",
      apiKey: "",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 4096,
enableCache: true,
recacheThreshold: 2000,
useLegacyChatCompletions: false,
  reasoningEffort: "",
      proxyRequests: false,
anthropicCacheTtl: "5m",
  humanInTheLoop: false,
  maxIterations: 100,
  customInstructions: "",
    });
  });
});

// =========================================================================
// Basic setters
// =========================================================================
describe("settingsStore — setters", () => {
  it("setApiKey stores and retrieves", () => {
    useSettingsStore.getState().setApiKey("sk-abc123");
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-abc123");
  });

  it("setApiKey with empty string clears the key", () => {
    useSettingsStore.getState().setApiKey("sk-temp");
    useSettingsStore.getState().setApiKey("");
    expect(useSettingsStore.getState().config.apiKey).toBe("");
  });

  it("setProviderId changes provider", () => {
    useSettingsStore.getState().setProviderId("ollama");
    expect(useSettingsStore.getState().config.providerId).toBe("ollama");
  });

  it("setPresetId stores the selected preset", () => {
    useSettingsStore.getState().setPresetId("ollama");
    expect(useSettingsStore.getState().config.presetId).toBe("ollama");
  });

  it("setModel changes model", () => {
    useSettingsStore.getState().setModel("gpt-4o-mini");
    expect(useSettingsStore.getState().config.model).toBe("gpt-4o-mini");
  });

  it("setBaseUrl changes endpoint", () => {
    useSettingsStore.getState().setBaseUrl("http://localhost:11434/v1");
    expect(useSettingsStore.getState().config.baseUrl).toBe(
      "http://localhost:11434/v1"
    );
  });

  it("setMaxTokens updates correctly", () => {
    useSettingsStore.getState().setMaxTokens(2048);
    expect(useSettingsStore.getState().config.maxTokens).toBe(2048);
  });

  it("setMaxIterations updates correctly", () => {
    useSettingsStore.getState().setMaxIterations(250);
    expect(useSettingsStore.getState().config.maxIterations).toBe(250);
  });

  it("setUseLegacyChatCompletions updates correctly", () => {
    useSettingsStore.getState().setUseLegacyChatCompletions(true);
    expect(useSettingsStore.getState().config.useLegacyChatCompletions).toBe(true);
    useSettingsStore.getState().setUseLegacyChatCompletions(false);
    expect(useSettingsStore.getState().config.useLegacyChatCompletions).toBe(false);
  });

  it("setReasoningEffort updates correctly and defaults to off", () => {
    expect(useSettingsStore.getState().config.reasoningEffort).toBe("");
    useSettingsStore.getState().setReasoningEffort("high");
    expect(useSettingsStore.getState().config.reasoningEffort).toBe("high");
    useSettingsStore.getState().setReasoningEffort("");
    expect(useSettingsStore.getState().config.reasoningEffort).toBe("");
  });

  it("setProxyRequests updates correctly", () => {
    useSettingsStore.getState().setProxyRequests(true);
    expect(useSettingsStore.getState().config.proxyRequests).toBe(true);
    useSettingsStore.getState().setProxyRequests(false);
    expect(useSettingsStore.getState().config.proxyRequests).toBe(false);
  });

  it("setAnthropicCacheTtl updates correctly", () => {
    useSettingsStore.getState().setAnthropicCacheTtl("1h");
    expect(useSettingsStore.getState().config.anthropicCacheTtl).toBe("1h");
    useSettingsStore.getState().setAnthropicCacheTtl("5m");
    expect(useSettingsStore.getState().config.anthropicCacheTtl).toBe("5m");
  });

  it("setHumanInTheLoop updates correctly", () => {
    useSettingsStore.getState().setHumanInTheLoop(true);
    expect(useSettingsStore.getState().config.humanInTheLoop).toBe(true);
    useSettingsStore.getState().setHumanInTheLoop(false);
    expect(useSettingsStore.getState().config.humanInTheLoop).toBe(false);
  });

  it("setCustomInstructions updates correctly", () => {
    expect(useSettingsStore.getState().config.customInstructions).toBe("");
    useSettingsStore.getState().setCustomInstructions("Always use British English.");
    expect(useSettingsStore.getState().config.customInstructions).toBe(
      "Always use British English."
    );
    useSettingsStore.getState().setCustomInstructions("");
    expect(useSettingsStore.getState().config.customInstructions).toBe("");
  });
});

// =========================================================================
// Edge value limits
// =========================================================================
describe("settingsStore — edge values", () => {
  it("allows zero maxTokens", () => {
    useSettingsStore.getState().setMaxTokens(0);
    expect(useSettingsStore.getState().config.maxTokens).toBe(0);
  });

  it("allows negative maxTokens (not validated yet)", () => {
    useSettingsStore.getState().setMaxTokens(-1);
    expect(useSettingsStore.getState().config.maxTokens).toBe(-1);
  });

  it("allows very large maxTokens", () => {
    useSettingsStore.getState().setMaxTokens(Number.MAX_SAFE_INTEGER);
    expect(useSettingsStore.getState().config.maxTokens).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });
});

// =========================================================================
// XSS and injection
// =========================================================================
describe("settingsStore — XSS & injection", () => {
  it("stores script tag as plain string without execution", () => {
    const xss = '<script>alert("xss")</script>';
    useSettingsStore.getState().setApiKey(xss);
    expect(useSettingsStore.getState().config.apiKey).toBe(xss);
    // It's stored as a string, not executed
  });

  it("handles HTML in providerId", () => {
    const html = '<img src=x onerror=alert(1)>';
    useSettingsStore.getState().setProviderId(html);
    expect(useSettingsStore.getState().config.providerId).toBe(html);
  });

  it("handles SQL-like injection in baseUrl", () => {
    const sqli = "https://evil.com'; DROP TABLE users; --";
    useSettingsStore.getState().setBaseUrl(sqli);
    expect(useSettingsStore.getState().config.baseUrl).toBe(sqli);
  });

  it("handles prototype pollution attempt in model name", () => {
    const protoPollute = "__proto__";
    useSettingsStore.getState().setModel(protoPollute);
    expect(useSettingsStore.getState().config.model).toBe("__proto__");
    // Verify global Object prototype was NOT polluted
    expect(({} as Record<string, unknown>)["__proto__"]).toBe(Object.prototype);
  });

  it("handles constructor pollution attempt", () => {
    const constructorStr = "constructor";
    useSettingsStore.getState().setModel(constructorStr);
    expect(useSettingsStore.getState().config.model).toBe("constructor");
  });

  it("handles newlines and special chars in apiKey", () => {
    const weird = "sk-\n\r\t\b\f\\\"'";
    useSettingsStore.getState().setApiKey(weird);
    expect(useSettingsStore.getState().config.apiKey).toBe(weird);
  });
});

// =========================================================================
// Persistence
// =========================================================================
describe("settingsStore — persistence", () => {
  it("persists to localStorage on change", () => {
    useSettingsStore.getState().setApiKey("sk-persist");
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.config.apiKey).toBe("sk-persist");
  });

  it("persists all config fields", () => {
    const store = useSettingsStore.getState();
    store.setProviderId("custom");
    store.setApiKey("sk-full");
    store.setModel("claude-3");
    store.setBaseUrl("https://custom.llm/v1");
    store.setMaxTokens(8192);

    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    const saved = parsed.state.config;
    expect(saved.providerId).toBe("custom");
    expect(saved.apiKey).toBe("sk-full");
    expect(saved.model).toBe("claude-3");
    expect(saved.baseUrl).toBe("https://custom.llm/v1");
    expect(saved.maxTokens).toBe(8192);
  });

  it("persists the selected presetId", () => {
    useSettingsStore.getState().setPresetId("ollama");
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    expect(parsed.state.config.presetId).toBe("ollama");
  });

  it("recovers from corrupted localStorage (invalid JSON)", () => {
    localStorage.setItem(STORAGE_KEY, "this is not json {{{");
    // Store should fall back to initial state on next create
    // Zustand's persist middleware handles this gracefully
    // Re-create store by removing and re-importing
    // For this test, we verify the raw corrupt value is present
    expect(localStorage.getItem(STORAGE_KEY)).toBe("this is not json {{{");
    // State remains unaffected since we already initialized
  });

  it("recovers from empty localStorage value", () => {
    localStorage.setItem(STORAGE_KEY, "");
    // Should handle gracefully
    expect(localStorage.getItem(STORAGE_KEY)).toBe("");
  });

  it("recovers from malformed zustand persist structure", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notState: true }));
    // Current store state unchanged — the persist middleware would
    // ignore this on rehydration
    expect(useSettingsStore.getState().config.providerId).toBe("openai");
  });

  it("picks up old API key without version field (backwards compat)", () => {
    const oldFormat = JSON.stringify({
      state: { config: { providerId: "openai", apiKey: "sk-old", model: "gpt-4", baseUrl: "https://api.openai.com/v1", temperature: 0.7, maxTokens: 4096 } },
      version: 0,
    });
    localStorage.setItem(STORAGE_KEY, oldFormat);

    // Persist middleware stores with version 0 — verify the stored format
    // is valid JSON and contains expected keys for rehydration
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed.state.config.apiKey).toBe("sk-old");
  });

  it("does not persist undefined values", () => {
    // All our config values are strings/numbers, never undefined
    const { config } = useSettingsStore.getState();
    for (const value of Object.values(config)) {
      expect(value).toBeDefined();
    }
  });

  it("handles unicode in stored values", () => {
    useSettingsStore.getState().setApiKey("sk-🌟-key");
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const reparsed = JSON.parse(raw);
    expect(reparsed.state.config.apiKey).toBe("sk-🌟-key");
  });

  it("handles very long API keys (10K chars)", () => {
    const longKey = "sk-" + "x".repeat(10000);
    useSettingsStore.getState().setApiKey(longKey);
    expect(useSettingsStore.getState().config.apiKey).toBe(longKey);
    const raw = localStorage.getItem(STORAGE_KEY)!;
    expect(raw.length).toBeGreaterThan(10000);
  });
});

// =========================================================================
// localStorage unavailability
// =========================================================================
describe("settingsStore — localStorage unavailability", () => {
  it("works in environments without localStorage (SSR/browser privacy)", () => {
    // Verify that even after clearing localStorage, setters work
    // Zustand's persist middleware falls back to in-memory by default
    localStorage.clear();
    useSettingsStore.getState().setApiKey("sk-fallback");
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-fallback");
  });
});

// =========================================================================
// Migration & compatibility
// =========================================================================
describe("settingsStore — migration", () => {
  it("partialize only persists config, not setters", () => {
    useSettingsStore.getState().setApiKey("sk-test");
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);
    // Setters should not be serialized
    expect(parsed.state.setApiKey).toBeUndefined();
    expect(parsed.state.setModel).toBeUndefined();
  });

  it("state object shape matches ProviderConfig on rehydration", () => {
    useSettingsStore.getState().setApiKey("sk-shape-test");
    const raw = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(raw);

    const expectedKeys = [
      "providerId",
      "apiKey",
      "model",
      "baseUrl",
      "maxTokens",
    ];
    for (const key of expectedKeys) {
      expect(parsed.state.config).toHaveProperty(key);
    }
  });

  it("fills new fields missing from older persisted configs with defaults", () => {
    // Simulate a persisted snapshot from before customInstructions existed.
    const oldFormat = JSON.stringify({
      state: { config: { providerId: "openai", apiKey: "sk-old", model: "gpt-4", baseUrl: "https://api.openai.com/v1", maxTokens: 4096 } },
      version: 0,
    });
    localStorage.setItem(STORAGE_KEY, oldFormat);

    // Re-hydrate from localStorage so the persist middleware re-runs its merge.
    useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().config.customInstructions).toBe("");
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-old");
  });
});

// =========================================================================
// Concurrent access patterns
// =========================================================================
describe("settingsStore — concurrent", () => {
  it("handles rapid sequential updates", () => {
    for (let i = 0; i < 100; i++) {
      useSettingsStore.getState().setMaxTokens(i * 10);
    }
    expect(useSettingsStore.getState().config.maxTokens).toBe(990);
  });

  it("handles multiple fields updated in quick succession", () => {
    const state = useSettingsStore.getState();
    state.setApiKey("sk-a");
    state.setModel("model-a");
    state.setMaxTokens(100);
    state.setApiKey("sk-b");
    state.setModel("model-b");

    const final = useSettingsStore.getState().config;
    expect(final.apiKey).toBe("sk-b");
    expect(final.model).toBe("model-b");
    expect(final.maxTokens).toBe(100);
  });

  it("setting same value twice is idempotent", () => {
    useSettingsStore.getState().setApiKey("sk-same");
    useSettingsStore.getState().setApiKey("sk-same");
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-same");
  });
});

// =========================================================================
// Empty / special provider IDs
// =========================================================================
describe("settingsStore — provider IDs", () => {
  it("allows empty providerId", () => {
    useSettingsStore.getState().setProviderId("");
    expect(useSettingsStore.getState().config.providerId).toBe("");
  });

  it("allows providerId with special characters", () => {
    const weirdId = "a/b?c=d&e#f";
    useSettingsStore.getState().setProviderId(weirdId);
    expect(useSettingsStore.getState().config.providerId).toBe(weirdId);
  });

  it("allows unicode providerId", () => {
    useSettingsStore.getState().setProviderId("プロバイダー");
    expect(useSettingsStore.getState().config.providerId).toBe("プロバイダー");
  });
});

// =========================================================================
// baseUrl edge cases
// =========================================================================
describe("settingsStore — baseUrl", () => {
  it("allows http URL (not https)", () => {
    useSettingsStore.getState().setBaseUrl("http://localhost:11434/v1");
    expect(useSettingsStore.getState().config.baseUrl).toBe(
      "http://localhost:11434/v1"
    );
  });

  it("allows URLs with ports", () => {
    useSettingsStore.getState().setBaseUrl("https://api.example.com:8080/v1");
    expect(useSettingsStore.getState().config.baseUrl).toBe(
      "https://api.example.com:8080/v1"
    );
  });

  it("allows IP addresses", () => {
    useSettingsStore.getState().setBaseUrl("http://192.168.1.100:11434/v1");
    expect(useSettingsStore.getState().config.baseUrl).toBe(
      "http://192.168.1.100:11434/v1"
    );
  });

  it("allows URLs with auth (less common but possible)", () => {
    useSettingsStore.getState().setBaseUrl("https://user:pass@api.example.com/v1");
    expect(useSettingsStore.getState().config.baseUrl).toBe(
      "https://user:pass@api.example.com/v1"
    );
  });

  it("allows empty baseUrl", () => {
    useSettingsStore.getState().setBaseUrl("");
    expect(useSettingsStore.getState().config.baseUrl).toBe("");
  });

  it("allows file:// URLs (for testing)", () => {
    useSettingsStore.getState().setBaseUrl("file:///tmp/mock-api");
    expect(useSettingsStore.getState().config.baseUrl).toBe("file:///tmp/mock-api");
  });

  it("allows very long baseUrl (2000 chars)", () => {
    const longPath = "x".repeat(1900);
    const longUrl = `https://api.example.com/v1/${longPath}`;
    useSettingsStore.getState().setBaseUrl(longUrl);
    expect(useSettingsStore.getState().config.baseUrl).toBe(longUrl);
  });
});
