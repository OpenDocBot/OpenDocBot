import { describe, it, expect } from "vitest";
import {
  isFoundryEndpoint,
  isFoundryHost,
  normalizeFoundryEndpoint,
} from "../../lib/foundryEndpoint";

const BASE = "https://res.services.ai.azure.com/openai/v1";

describe("normalizeFoundryEndpoint", () => {
  it("returns an empty string for empty input", () => {
    expect(normalizeFoundryEndpoint("")).toBe("");
    expect(normalizeFoundryEndpoint("   ")).toBe("");
  });

  it("keeps the canonical v1 base", () => {
    expect(normalizeFoundryEndpoint(BASE)).toBe(BASE);
  });

  it("reduces a full completion URL to the base", () => {
    expect(normalizeFoundryEndpoint(`${BASE}/chat/completions`)).toBe(BASE);
    expect(normalizeFoundryEndpoint(`${BASE}/responses`)).toBe(BASE);
    expect(normalizeFoundryEndpoint(`${BASE}?api-version=preview`)).toBe(BASE);
  });

  it("reduces the legacy Model Inference endpoints to the base", () => {
    expect(normalizeFoundryEndpoint("https://res.services.ai.azure.com/models")).toBe(BASE);
    expect(
      normalizeFoundryEndpoint(
        "https://res.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview"
      )
    ).toBe(BASE);
  });

  it("completes a bare Foundry resource root", () => {
    expect(normalizeFoundryEndpoint("https://res.services.ai.azure.com")).toBe(BASE);
    expect(normalizeFoundryEndpoint("https://res.services.ai.azure.com/")).toBe(BASE);
    expect(normalizeFoundryEndpoint("https://res.openai.azure.com/")).toBe(
      "https://res.openai.azure.com/openai/v1"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeFoundryEndpoint(`  ${BASE}  `)).toBe(BASE);
  });

  it("leaves non-Foundry values untouched", () => {
    expect(normalizeFoundryEndpoint("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1"
    );
    expect(normalizeFoundryEndpoint("not a url")).toBe("not a url");
  });
});

describe("isFoundryEndpoint", () => {
  it("accepts every shape of a Foundry resource URL", () => {
    expect(isFoundryEndpoint(BASE)).toBe(true);
    expect(isFoundryEndpoint("https://res.openai.azure.com/openai/v1")).toBe(true);
    expect(isFoundryEndpoint("https://res.services.ai.azure.com")).toBe(true);
    expect(isFoundryEndpoint("https://res.services.ai.azure.com/models/chat/completions")).toBe(
      true
    );
    expect(isFoundryEndpoint(`${BASE}/chat/completions?api-version=preview`)).toBe(true);
  });

  it("rejects non-Azure hosts", () => {
    expect(isFoundryEndpoint("https://api.openai.com/v1")).toBe(false);
    expect(isFoundryEndpoint("https://api.deepseek.com")).toBe(false);
  });

  it("rejects non-HTTPS endpoints", () => {
    expect(isFoundryEndpoint("http://res.services.ai.azure.com/openai/v1")).toBe(false);
  });

  it("rejects empty or malformed values", () => {
    expect(isFoundryEndpoint("")).toBe(false);
    expect(isFoundryEndpoint("not a url")).toBe(false);
  });
});

describe("isFoundryHost", () => {
  it("matches Azure Foundry hosts and subdomains", () => {
    expect(isFoundryHost("https://res.services.ai.azure.com/openai/v1")).toBe(true);
    expect(isFoundryHost("https://res.openai.azure.com/openai/v1")).toBe(true);
  });

  it("does not match unrelated hosts", () => {
    expect(isFoundryHost("https://api.openai.com/v1")).toBe(false);
    expect(isFoundryHost("https://example.com")).toBe(false);
    expect(isFoundryHost("not a url")).toBe(false);
  });
});
