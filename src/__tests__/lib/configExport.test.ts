import { describe, it, expect, afterEach, vi } from "vitest";
import {
  EXPORT_EXCLUDED_KEYS,
  SECRET_KEYS,
  buildConfigFromImport,
  exportConfigBlob,
  getExportExcludedKeys,
  importConfigBlob,
  normalizeImportedConfig,
  pickExportableConfig,
} from "../../lib/configExport";
import { ConfigCryptoError } from "../../lib/configCrypto";
import { DEFAULT_PROVIDER_CONFIG, type ProviderConfig } from "../../store/settingsStore";

afterEach(() => {
  vi.unstubAllEnvs();
});

const PASS = "passphrase-1234567890";

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    presetId: "openai",
    providerId: "openaicompat",
    apiKey: "sk-secret-value",
    model: "gpt-5.6-luna",
    baseUrl: "https://api.openai.com/v1",
    customHeaders: { "x-tenant": "acme" },
    ...overrides,
  };
}

describe("configExport — getExportExcludedKeys", () => {
  it("is empty by default", () => {
    vi.stubEnv("VITE_CONFIG_EXPORT_EXCLUDE", "");
    expect(getExportExcludedKeys()).toEqual([]);
    expect(EXPORT_EXCLUDED_KEYS).toEqual([]);
  });

  it("parses, trims, drops empties and dedupes the env override", () => {
    vi.stubEnv("VITE_CONFIG_EXPORT_EXCLUDE", " apiKey, customHeaders ,,apiKey, ");
    expect(getExportExcludedKeys()).toEqual(["apiKey", "customHeaders"]);
  });

  it("returns a fresh array each call (no shared mutation)", () => {
    vi.stubEnv("VITE_CONFIG_EXPORT_EXCLUDE", "apiKey");
    const a = getExportExcludedKeys();
    a.push("model");
    expect(getExportExcludedKeys()).toEqual(["apiKey"]);
  });
});

describe("configExport — pickExportableConfig", () => {
  it("includes every defined key when nothing is excluded", () => {
    const picked = pickExportableConfig(makeConfig(), []);
    expect(picked.apiKey).toBe("sk-secret-value");
    expect(picked.model).toBe("gpt-5.6-luna");
    expect(picked.customHeaders).toEqual({ "x-tenant": "acme" });
  });

  it("omits excluded keys", () => {
    const picked = pickExportableConfig(makeConfig(), ["apiKey", "customHeaders"]);
    expect(picked).not.toHaveProperty("apiKey");
    expect(picked).not.toHaveProperty("customHeaders");
    expect(picked.model).toBe("gpt-5.6-luna");
  });

  it("omits undefined values", () => {
    const picked = pickExportableConfig(makeConfig({ presetId: undefined }), []);
    expect(picked).not.toHaveProperty("presetId");
  });

  it("deep-clones customHeaders so the source is isolated", () => {
    const config = makeConfig();
    const picked = pickExportableConfig(config, []);
    (picked.customHeaders as Record<string, string>)["x-tenant"] = "mutated";
    expect(config.customHeaders).toEqual({ "x-tenant": "acme" });
  });

  it("does not mutate the input config", () => {
    const config = makeConfig();
    const snapshot = structuredClone(config);
    pickExportableConfig(config, ["apiKey"]);
    expect(config).toEqual(snapshot);
  });
});

describe("configExport — normalizeImportedConfig", () => {
  it("returns {} for non-objects", () => {
    expect(normalizeImportedConfig(null)).toEqual({});
    expect(normalizeImportedConfig(undefined)).toEqual({});
    expect(normalizeImportedConfig("nope")).toEqual({});
    expect(normalizeImportedConfig(42)).toEqual({});
    expect(normalizeImportedConfig([1, 2])).toEqual({});
  });

  it("keeps well-typed fields and drops unknown keys", () => {
    const out = normalizeImportedConfig({
      model: "gpt-4o",
      apiKey: "sk-1",
      maxTokens: 2048,
      humanInTheLoop: true,
      anthropicCacheTtl: "1h",
      openRouterRegion: "eu",
      notAField: "ignored",
    });
    expect(out).toEqual({
      model: "gpt-4o",
      apiKey: "sk-1",
      maxTokens: 2048,
      humanInTheLoop: true,
      anthropicCacheTtl: "1h",
      openRouterRegion: "eu",
    });
  });

  it("drops fields of the wrong type", () => {
    const out = normalizeImportedConfig({
      model: 123,
      apiKey: null,
      maxTokens: "4096",
      humanInTheLoop: "true",
      suggestionMode: 1,
      presetId: 7,
    });
    expect(out).toEqual({});
  });

  it("enforces enums", () => {
    expect(normalizeImportedConfig({ anthropicCacheTtl: "2h" })).toEqual({});
    expect(normalizeImportedConfig({ openRouterRegion: "apac" })).toEqual({});
    expect(normalizeImportedConfig({ anthropicCacheTtl: "5m" })).toEqual({ anthropicCacheTtl: "5m" });
  });

  it("enforces numeric ranges", () => {
    expect(normalizeImportedConfig({ maxTokens: 0 })).toEqual({});
    expect(normalizeImportedConfig({ maxTokens: -5 })).toEqual({});
    expect(normalizeImportedConfig({ maxTokens: 3.5 })).toEqual({});
    expect(normalizeImportedConfig({ recacheThreshold: -1 })).toEqual({});
    expect(normalizeImportedConfig({ maxIterations: 0 })).toEqual({});
    expect(normalizeImportedConfig({ maxTokens: 1 })).toEqual({ maxTokens: 1 });
    expect(normalizeImportedConfig({ maxIterations: 1 })).toEqual({ maxIterations: 1 });
  });

  it("normalizes customHeaders and drops non-string/unsafe entries", () => {
    expect(normalizeImportedConfig({ customHeaders: { a: "1", b: 2, "__proto__": "x" } })).toEqual({
      customHeaders: { a: "1" },
    });
    expect(normalizeImportedConfig({ customHeaders: ["a"] })).toEqual({});
    expect(normalizeImportedConfig({ customHeaders: "nope" })).toEqual({});
    expect(normalizeImportedConfig({ customHeaders: {} })).toEqual({ customHeaders: {} });
  });

  it("ignores prototype-pollution attempts", () => {
    const out = normalizeImportedConfig(JSON.parse('{"__proto__":{"polluted":true},"model":"m"}'));
    expect(out).toEqual({ model: "m" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("configExport — buildConfigFromImport", () => {
  it("fills missing keys from defaults (replace-all)", () => {
    const config = buildConfigFromImport({ model: "m", apiKey: "k" }, 1);
    expect(config.model).toBe("m");
    expect(config.apiKey).toBe("k");
    expect(config.maxTokens).toBe(DEFAULT_PROVIDER_CONFIG.maxTokens);
    expect(config.openRouterRegion).toBe("global");
    expect(config.customHeaders).toEqual({});
  });

  it("returns a complete config with every ProviderConfig key", () => {
    const config = buildConfigFromImport({ model: "m" }, 1);
    expect(Object.keys(config).sort()).toEqual(Object.keys(DEFAULT_PROVIDER_CONFIG).sort());
  });

  it("migrates legacy fields from an older schema version", () => {
    const config = buildConfigFromImport({ model: "m", temperature: 0.7 }, 0);
    expect(config).not.toHaveProperty("temperature");
    expect(config.model).toBe("m");
  });

  it("does not share the customHeaders reference with the defaults", () => {
    const config = buildConfigFromImport({}, 1);
    config.customHeaders!["x"] = "y";
    expect(DEFAULT_PROVIDER_CONFIG.customHeaders).toEqual({});
  });
});

describe("configExport — export/import wrappers", () => {
  it("round-trips a full config", async () => {
    const config = makeConfig();
    const blob = await exportConfigBlob(config, PASS);
    const { config: imported } = await importConfigBlob(blob, PASS);
    expect(imported).toEqual(config);
  });

  it("includes secrets by default", async () => {
    const blob = await exportConfigBlob(makeConfig(), PASS);
    const { config } = await importConfigBlob(blob, PASS);
    expect(config.apiKey).toBe("sk-secret-value");
    expect(config.customHeaders).toEqual({ "x-tenant": "acme" });
  });

  it("omits excluded keys and leaks none of their values into the blob", async () => {
    const blob = await exportConfigBlob(makeConfig(), PASS, {
      excludedKeys: ["apiKey", "customHeaders"],
    });
    expect(blob).not.toContain("sk-secret-value");
    expect(blob).not.toContain("acme");
    const { config } = await importConfigBlob(blob, PASS);
    expect(config.apiKey).toBe("");
    expect(config.customHeaders).toEqual({});
  });

  it("can omit secrets via SECRET_KEYS", async () => {
    const blob = await exportConfigBlob(makeConfig(), PASS, { excludedKeys: SECRET_KEYS });
    const { config } = await importConfigBlob(blob, PASS);
    expect(config.apiKey).toBe("");
    expect(config.customHeaders).toEqual({});
    expect(config.model).toBe("gpt-5.6-luna");
  });

  it("rejects the wrong passphrase", async () => {
    const blob = await exportConfigBlob(makeConfig(), PASS);
    await expect(importConfigBlob(blob, "wrong-pass")).rejects.toBeInstanceOf(ConfigCryptoError);
  });

  it("rejects an empty passphrase on export", async () => {
    await expect(exportConfigBlob(makeConfig(), "")).rejects.toMatchObject({ code: "EMPTY_PASSPHRASE" });
  });
});
