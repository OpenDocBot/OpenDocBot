import { describe, it, expect } from "vitest";
import { buildRequestUrl } from "../../providers/proxyUrl";

describe("buildRequestUrl", () => {
  it("returns the direct URL when proxy is off", () => {
    expect(buildRequestUrl("https://api.openai.com/v1", "/responses")).toBe(
      "https://api.openai.com/v1/responses"
    );
  });

  it("strips trailing slashes from the base URL", () => {
    expect(buildRequestUrl("https://api.openai.com/v1/", "/models")).toBe(
      "https://api.openai.com/v1/models"
    );
  });

  it("returns a same-origin /proxy/ URL when proxy is on", () => {
    const url = buildRequestUrl(
      "https://opencode.ai/zen/go/v1",
      "/responses",
      true
    );
    expect(url).toBe(
      `/proxy/${encodeURIComponent("https://opencode.ai/zen/go/v1")}/responses`
    );
  });

  it("keeps the query string on the proxied path", () => {
    const url = buildRequestUrl(
      "https://generativelanguage.googleapis.com/v1beta",
      "/models/gemini-x:streamGenerateContent?alt=sse",
      true
    );
    expect(url.endsWith(":streamGenerateContent?alt=sse")).toBe(true);
    expect(url.startsWith("/proxy/")).toBe(true);
  });
});
