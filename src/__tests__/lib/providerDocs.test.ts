import { describe, it, expect } from "vitest";
import { getProviderDocsUrl, PROVIDER_DOCS_INDEX } from "../../lib/providerDocs";

describe("getProviderDocsUrl", () => {
  it("maps presets to their provider docs", () => {
    expect(getProviderDocsUrl("openai")).toBe("https://opendocbot.com/docs/providers/openai");
    expect(getProviderDocsUrl("anthropic")).toBe("https://opendocbot.com/docs/providers/anthropic");
    expect(getProviderDocsUrl("gemini")).toBe("https://opendocbot.com/docs/providers/gemini");
    expect(getProviderDocsUrl("deepseek")).toBe("https://opendocbot.com/docs/providers/deepseek");
    expect(getProviderDocsUrl("bedrock")).toBe("https://opendocbot.com/docs/providers/bedrock");
    expect(getProviderDocsUrl("foundry")).toBe("https://opendocbot.com/docs/providers/foundry");
    expect(getProviderDocsUrl("ollama")).toBe("https://opendocbot.com/docs/providers/ollama");
    expect(getProviderDocsUrl("openrouter")).toBe("https://opendocbot.com/docs/providers/openrouter");
    expect(getProviderDocsUrl("custom")).toBe("https://opendocbot.com/docs/providers/custom");
    expect(getProviderDocsUrl("opencode")).toBe("https://opendocbot.com/docs/providers/opencode");
  });

  it("falls back to the provider index", () => {
    expect(getProviderDocsUrl()).toBe(PROVIDER_DOCS_INDEX);
    expect(getProviderDocsUrl(null)).toBe(PROVIDER_DOCS_INDEX);
    expect(getProviderDocsUrl("unknown")).toBe(PROVIDER_DOCS_INDEX);
  });
});
