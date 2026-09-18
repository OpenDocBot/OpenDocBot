import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "../../providers/gemini";
import type { LLMMessage, ToolDefinition } from "../../providers/types";

let provider: GeminiProvider;

const tools: ToolDefinition[] = [];
const opts = {
  apiKey: "key",
  model: "gemini-x",
  baseUrl: "https://api.test",
  maxTokens: 100,
  enableCache: true,
  recacheThreshold: 1024,
};

function makeMessages(count: number): LLMMessage[] {
  const arr: LLMMessage[] = [{ role: "system", content: "You are an assistant." }];
  for (let i = 0; i < count; i++) {
    arr.push({ role: "user", content: "hello world ".repeat(80) });
  }
  return arr;
}

interface LoggedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function createMockGemini() {
  let cacheCreates = 0;
  let failNextGenerate = false;
  const log: LoggedCall[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    log.push({ url, method, body });

    if (method === "DELETE") {
      return { ok: true, status: 200 } as Response;
    }

    if (url.includes("cachedContents")) {
      cacheCreates++;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          name: `cachedContents/c${cacheCreates}`,
          model: "models/gemini-x",
          createTime: "",
          updateTime: "",
          expireTime: new Date(Date.now() + 3600000).toISOString(),
        }),
      } as Response;
    }

    if (failNextGenerate) {
      failNextGenerate = false;
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("cachedContent not found"),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        candidates: [{ content: { role: "model", parts: [{ text: "hi" }] } }],
      }),
    } as Response;
  });

  return {
    log,
    cacheCreates: () => cacheCreates,
    failNext: () => {
      failNextGenerate = true;
    },
    generateBodies: () => log.filter((c) => c.url.includes("generateContent")).map((c) => c.body),
  };
}

describe("GeminiProvider — context caching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new GeminiProvider();
  });

  it("creates the cache on the first call and sends the full body", async () => {
    const m = createMockGemini();
    await provider.chat(makeMessages(8), tools, opts);

    expect(m.cacheCreates()).toBe(1);
    const firstGenerate = m.generateBodies()[0];
    expect(firstGenerate?.cachedContent).toBeUndefined();
  });

  it("uses cachedContent once the cache exists and delta is small", async () => {
    const m = createMockGemini();
    await provider.chat(makeMessages(8), tools, opts);
    await provider.chat(makeMessages(9), tools, opts);

    expect(m.cacheCreates()).toBe(1);
    const bodies = m.generateBodies();
    expect(bodies[1]?.cachedContent).toBe("cachedContents/c1");
    expect((bodies[1]?.contents as unknown[]).length).toBe(1);
  });

  it("keeps using the cache across turns with a suggestion-mode prompt and tool set", async () => {
    const m = createMockGemini();
    const suggestionSystem =
      "You are in read-only suggestion mode. Use add_suggestion. " +
      "<suggestion_mode>Never edit the document.</suggestion_mode>";
    const suggestionTools: ToolDefinition[] = [
      { name: "add_suggestion", description: "Add a review comment", parameters: { type: "object", properties: {} } },
      { name: "read_doc_section", description: "Read a section", parameters: { type: "object", properties: {} } },
    ];
    const base: LLMMessage[] = [{ role: "system", content: suggestionSystem }];
    for (let i = 0; i < 8; i++) base.push({ role: "user", content: "hello world ".repeat(80) });

    await provider.chat(base, suggestionTools, opts);
    await provider.chat([...base, { role: "user", content: "another turn" }], suggestionTools, opts);

    // Same system prompt + tools across turns: the cache is reused, not rebuilt.
    expect(m.cacheCreates()).toBe(1);
    expect(m.generateBodies()[1]?.cachedContent).toBe("cachedContents/c1");
  });

  it("rebuilds the cache when the delta crosses the threshold and sends full body", async () => {
    const m = createMockGemini();
    await provider.chat(makeMessages(8), tools, opts);
    await provider.chat(makeMessages(9), tools, opts);
    await provider.chat(makeMessages(16), tools, opts);

    expect(m.cacheCreates()).toBe(2);
    const bodies = m.generateBodies();
    expect(bodies[2]?.cachedContent).toBeUndefined();
  });

  it("retries once without the cache on a stale cachedContent error", async () => {
    const m = createMockGemini();
    await provider.chat(makeMessages(8), tools, opts);
    await provider.chat(makeMessages(9), tools, opts);

    m.failNext();
    const response = await provider.chat(makeMessages(10), tools, opts);

    expect(response.content).toBe("hi");
    const bodies = m.generateBodies();
    // First attempt used the (stale) cache; the retry sends the full body
    expect(bodies[2]?.cachedContent).toBe("cachedContents/c1");
    expect(bodies[3]?.cachedContent).toBeUndefined();
    expect(m.log.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("sends the full body instead of an empty placeholder when the cache is ahead", async () => {
    const m = createMockGemini();
    // First call creates a cache holding 8 messages
    await provider.chat(makeMessages(8), tools, opts);
    // Next call has FEWER messages than the cache (turn-boundary mismatch)
    const response = await provider.chat(makeMessages(6), tools, opts);

    expect(response.content).toBe("hi");
    const bodies = m.generateBodies();
    const lastBody = bodies[bodies.length - 1];
    expect(lastBody?.cachedContent).toBeUndefined();
    // No empty placeholder user message is sent
    const contents = lastBody?.contents as Array<{ parts: Array<{ text?: string }> }> | undefined;
    const hasEmptyPart = (contents || []).some(
      (c) => c.parts.length === 1 && typeof c.parts[0].text === "string" && c.parts[0].text!.length === 0
    );
    expect(hasEmptyPart).toBe(false);
  });

  it("flushCache deletes the active remote cache", async () => {
    const m = createMockGemini();
    await provider.chat(makeMessages(8), tools, opts);

    provider.flushCache();

    const deleteCall = m.log.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toBe("https://api.test/cachedContents/c1");
  });
});
