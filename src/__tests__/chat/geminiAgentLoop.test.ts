import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgentLoop } from "../../chat/agentLoop";
import { GeminiProvider } from "../../providers/gemini";
import { toolRegistry } from "../../tools/registry";

let provider: GeminiProvider;

const opts = {
  apiKey: "key",
  model: "gemini-x",
  baseUrl: "https://api.test",
  enableCache: false,
  maxTokens: 256,
};

function mockGeminiStreams(responses: string[][]) {
  let i = 0;
  const encoder = new TextEncoder();
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const lines = responses[i] ?? ['data: {"candidates":[]}'];
    i++;
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
}

function capturedBodies(): Array<Record<string, unknown>> {
  const mock = vi.mocked(globalThis.fetch);
  return mock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

const FUNCTION_CALL_SSE =
  'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"test_tool","args":{}}}]}}]}';
const DONE_SSE =
  'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"All done"}]}}]}';

beforeEach(() => {
  vi.restoreAllMocks();
  provider = new GeminiProvider();
  toolRegistry.register(
    { name: "test_tool", description: "A test tool", parameters: { type: "object", properties: {} } },
    async () => JSON.stringify({ ok: true })
  );
});

describe("agentLoop → GeminiProvider end-to-end (wire-format regression guard)", () => {
  it("produces valid Gemini request bodies across a tool iteration", async () => {
    mockGeminiStreams([[FUNCTION_CALL_SSE], [DONE_SSE]]);

    const toolStarts: string[] = [];
    const result = await runAgentLoop(provider, "run the tool", opts, {
      onToolStart: (name) => toolStarts.push(name),
    });

    expect(result.content).toBe("All done");
    expect(result.iterations).toBe(2);
    expect(toolStarts).toEqual(["test_tool"]);

    const bodies = capturedBodies();
    expect(bodies).toHaveLength(2);

    // Iteration 1: system instruction, user content, tools, max tokens
    const first = bodies[0];
    expect(first.systemInstruction).toEqual({ parts: [{ text: expect.stringContaining("You are an AI assistant") }] });
    expect(first.contents).toEqual([{ role: "user", parts: [{ text: "run the tool" }] }]);
    const decls = (first.tools as Array<{ functionDeclarations: Array<{ name: string }> }>)[0].functionDeclarations;
    expect(decls.map((d) => d.name)).toContain("test_tool");
    expect(decls.find((d) => d.name === "test_tool")).toMatchObject({
      description: "A test tool",
      parameters: { type: "object", properties: {} },
    });
    expect(first.generationConfig).toEqual({ maxOutputTokens: 256 });

    // Iteration 2: assistant functionCall + tool functionResponse appended
    const second = bodies[1];
    expect(second.contents).toEqual([
      { role: "user", parts: [{ text: "run the tool" }] },
      { role: "model", parts: [{ functionCall: { name: "test_tool", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { name: "test_tool", response: { ok: true } } }] },
    ]);
  });

  it("preserves the thoughtSignature through the loop into the request body", async () => {
    mockGeminiStreams([
      [
        'data: {"candidates":[{"content":{"role":"model","parts":[{"thought":{"text":"thinking","thought_signature":"sig_9"}}]}}]}',
        'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"test_tool","args":{}},"thoughtSignature":"sig_9"}]}}]}',
      ],
      [DONE_SSE],
    ]);

    await runAgentLoop(provider, "go", opts);

    const bodies = capturedBodies();
    const second = bodies[1] as { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> };
    const modelParts = second.contents.find((c) => c.role === "model")?.parts || [];
    expect(modelParts[0]).toEqual({
      functionCall: { name: "test_tool", args: {} },
      thoughtSignature: "sig_9",
    });
  });
});
