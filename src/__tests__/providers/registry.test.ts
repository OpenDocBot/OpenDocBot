import { describe, it, expect } from "vitest";
import { getProvider, listProviders } from "../../providers/registry";

describe("registry — provider management", () => {
  it("has at least two providers registered", () => {
    expect(listProviders().length).toBeGreaterThanOrEqual(2);
  });

  it("registers the anthropic provider", () => {
    const p = getProvider("anthropic");
    expect(p).toBeDefined();
    expect(p!.id).toBe("anthropic");
    expect(p!.label).toBe("Anthropic Claude");
    expect(p!.requiresKey).toBe(true);
  });

  it("getProvider() without args returns first provider", () => {
    const p = getProvider();
    expect(p).toBeDefined();
    expect(typeof p.id).toBe("string");
  });

  it("getProvider(id) returns specific provider", () => {
    const providers = listProviders();
    for (const p of providers) {
      const found = getProvider(p.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(p.id);
    }
  });

  it("getProvider with unknown id falls back to first provider", () => {
    const p = getProvider("nonexistent");
    expect(p).toBeDefined();
  });

  it("listProviders returns consistent array", () => {
    const a = listProviders();
    const b = listProviders();
    expect(a).toEqual(b);
  });

  it("provider has all required interface methods", () => {
    const p = getProvider();
    expect(typeof p.id).toBe("string");
    expect(typeof p.label).toBe("string");
    expect(typeof p.requiresKey).toBe("boolean");
    expect(typeof p.defaultModel).toBe("string");
    expect(typeof p.listModels).toBe("function");
    expect(typeof p.chat).toBe("function");
    expect(typeof p.chatStream).toBe("function");
  });
});
