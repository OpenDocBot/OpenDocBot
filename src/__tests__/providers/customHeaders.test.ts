import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "../../providers/openai";
import { AnthropicProvider } from "../../providers/anthropic";
import { GeminiProvider } from "../../providers/gemini";
import { clearDebugLogs } from "../../lib/debugLog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mockOk(): { headers: () => Record<string, string> } {
  let captured: RequestInit | undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    captured = init;
    return { ok: true, status: 200, json: () => Promise.resolve({}) } as Response;
  });
  return {
    headers: () => (captured?.headers ?? {}) as Record<string, string>,
  };
}

function mockStreamOk(lines: string[]): { headers: () => Record<string, string> } {
  let captured: RequestInit | undefined;
  const encoder = new TextEncoder();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    captured = init;
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
          controller.close();
        },
      }),
    } as unknown as Response;
  });
  return {
    headers: () => (captured?.headers ?? {}) as Record<string, string>,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearDebugLogs();
});

describe("custom headers reach the provider request", () => {
  it("OpenAI-compatible (legacy chat)", async () => {
    const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");
    const { headers } = mockOk();

    await provider.chat(
      [{ role: "user", content: "hi" }],
      [],
      {
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        baseUrl: "https://api.test/v1",
        maxTokens: 100,
        useLegacyChatCompletions: true,
        customHeaders: { "x-opencode-session": "$SESSION_ID", "x-app": "OpenDocBot" },
      }
    );

    const h = headers();
    expect(h.Authorization).toBe("Bearer sk-test");
    expect(h["x-app"]).toBe("OpenDocBot");
    expect(h["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("OpenAI-compatible (Responses API)", async () => {
    const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");
    const { headers } = mockOk();

    await provider.chat(
      [{ role: "user", content: "hi" }],
      [],
      {
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        baseUrl: "https://api.test/v1",
        maxTokens: 100,
        customHeaders: { "x-session": "$SESSION_ID" },
      }
    );

    expect(headers()["x-session"]).toMatch(UUID_RE);
  });

  it("Anthropic", async () => {
    const provider = new AnthropicProvider();
    const { headers } = mockOk();

    await provider.chat(
      [{ role: "user", content: "hi" }],
      [],
      {
        apiKey: "sk-anthropic",
        model: "claude-haiku-4-5",
        baseUrl: "https://api.anthropic.com/v1",
        maxTokens: 100,
        customHeaders: { "x-session": "$SESSION_ID" },
      }
    );

    const h = headers();
    expect(h["x-api-key"]).toBe("sk-anthropic");
    expect(h["x-session"]).toMatch(UUID_RE);
  });

  it("Gemini", async () => {
    const provider = new GeminiProvider();
    const { headers } = mockOk();

    await provider.chat(
      [{ role: "user", content: "hi" }],
      [],
      {
        apiKey: "g-key",
        model: "gemini-3.5-flash-lite",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        maxTokens: 100,
        customHeaders: { "x-tenant": "acme", "x-session": "$SESSION_ID" },
      }
    );

    const h = headers();
    expect(h["x-goog-api-key"]).toBe("g-key");
    expect(h["x-tenant"]).toBe("acme");
    expect(h["x-session"]).toMatch(UUID_RE);
  });

  it("no custom headers by default", async () => {
    const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");
    const { headers } = mockOk();

    await provider.chat(
      [{ role: "user", content: "hi" }],
      [],
      {
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        baseUrl: "https://api.test/v1",
        maxTokens: 100,
        useLegacyChatCompletions: true,
      }
    );

    const h = headers();
    expect(h.Authorization).toBe("Bearer sk-test");
    expect(Object.keys(h)).not.toContain("x-session");
  });

  it("OpenAI-compatible streaming (Responses SSE) sends custom headers", async () => {
    const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");
    const { headers } = mockStreamOk([
      'data: {"type":"response.output_text.delta","delta":"hi"}',
      'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1}}}',
    ]);

    let tokens = "";
    await provider.chatStream(
      [{ role: "user", content: "hi" }],
      (t) => { tokens += t; },
      () => {},
      [],
      {
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        baseUrl: "https://api.test/v1",
        maxTokens: 100,
        customHeaders: { "x-opencode-session": "$SESSION_ID" },
      }
    );

    expect(tokens).toBe("hi");
    expect(headers()["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("OpenAI-compatible streaming (legacy SSE) sends custom headers", async () => {
    const provider = new OpenAICompatibleProvider("test", "Test", true, "gpt-5.6-luna");
    const { headers } = mockStreamOk([
      'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}',
    ]);

    let tokens = "";
    await provider.chatStream(
      [{ role: "user", content: "hi" }],
      (t) => { tokens += t; },
      () => {},
      [],
      {
        apiKey: "sk-test",
        model: "gpt-5.6-luna",
        baseUrl: "https://api.test/v1",
        maxTokens: 100,
        useLegacyChatCompletions: true,
        customHeaders: { "x-opencode-session": "$SESSION_ID" },
      }
    );

    expect(tokens).toBe("hi");
    expect(headers()["x-opencode-session"]).toMatch(UUID_RE);
  });
});