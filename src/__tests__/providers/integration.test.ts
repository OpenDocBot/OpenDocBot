/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration tests for tool calling with real providers.
 *
 * Every provider (OpenAI-compatible / OpenCode Zen, Gemini, Anthropic) is run
 * against the tool set of every host (Word, Excel, PowerPoint). This catches
 * provider-side schema regressions — e.g. a JSON-Schema construct that one
 * provider accepts and another rejects (see write_range's union type).
 *
 * Run with:
 *   OPENCODE_API_KEY=sk-... OPENAI_API_KEY=... GEMINI_API_KEY=... ANTHROPIC_API_KEY=... \
 *     npm test -- src/__tests__/providers/integration.test.ts
 *
 * Each provider's suite is skipped when its key is not set (CI-safe).
 */

import { describe, it, expect } from "vitest";
import { toolRegistry } from "../../tools";
import { StreamToolParser } from "../../chat/toolCallParser";
import { OpenAICompatibleProvider } from "../../providers/openai";
import type { ToolCallRequest, ToolDefinition } from "../../providers/types";

import "../../tools";

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BASE_URL = "https://opencode.ai/zen/go/v1";
const TIMEOUT = 120000;

const ALL_MODELS = [
  "deepseek-v4-flash",
];

const HOSTS = ["word", "excel", "powerpoint"] as const;

const HOST_PROMPTS: Record<string, { system: string; user: string }> = {
  word: {
    system: "You are a document assistant. NEVER reply in chat — always use tools.",
    user: "Write one paragraph about Madrid in the document.",
  },
  excel: {
    system: "You are a spreadsheet assistant. NEVER reply in chat — always use tools.",
    user: "Write the city name Madrid into cell A1 of the worksheet.",
  },
  powerpoint: {
    system: "You are a presentation assistant. NEVER reply in chat — always use tools.",
    user: "Add a slide that says 'Madrid' to the presentation.",
  },
};

const opencodeShouldRun = !!OPENCODE_API_KEY;
const openaiShouldRun = !!OPENAI_API_KEY;
const geminiShouldRun = !!GEMINI_API_KEY;
const anthropicShouldRun = !!ANTHROPIC_API_KEY;

function getTestTools(host: string): ToolDefinition[] {
  // Match the agent loop: only expose tools for the current host.
  return toolRegistry
    .listDefinitionsForHost(host)
    .filter((t) => t.name !== "ask_user_question");
}

function makeToolCall(name: string): ToolCallRequest {
  return { id: `call_${name}`, type: "function", function: { name, arguments: "{}" } };
}

async function mockExecuteTool(name: string): Promise<string> {
  switch (name) {
    case "execute_office_js":
      return JSON.stringify({ success: true, result: "Content written" });
    case "read_doc_section":
      return JSON.stringify({
        paragraphs: [{ index: 0, text: "Sample paragraph.", style: "Normal" }],
        start_index: 0, end_index: 1, total_paragraphs: 1,
      });
    case "edit_doc_text":
    case "write_range":
    case "edit_slide_text":
    case "insert_slide_element":
    case "modify_presentation_structure":
      return JSON.stringify({ success: true, replaced: true });
    case "read_range":
    case "list_worksheets":
    case "read_slide":
    case "read_slide_text":
    case "get_presentation_structure":
    case "list_slide_shapes":
      return JSON.stringify({ success: true, data: [] });
    default:
      return JSON.stringify({ success: true });
  }
}

// --- OpenAI-compatible (OpenCode Zen) ---

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  for (const MODEL of ALL_MODELS) {
    describe(`OpenCode Zen — ${MODEL} — ${host}`, () => {
      (opencodeShouldRun ? it.concurrent : it.skip)(
        "emits tool calls via delta.tool_calls",
        async () => {
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode Zen", true, MODEL);
          const properCalls: ToolCallRequest[] = [];

          await provider.chatStream(
            [
              { role: "system", content: prompts.system },
              { role: "user", content: prompts.user },
            ],
            () => {},
            (tc) => { properCalls.push(tc); },
            hostTools,
            { apiKey: OPENCODE_API_KEY, model: MODEL, maxTokens: 4096, baseUrl: BASE_URL, useLegacyChatCompletions: true }
          );

          const toolNames = properCalls.map((c) => c.function.name);
          expect(
            toolNames.length,
            `${MODEL}/${host}: No tool calls via delta.tool_calls. Model may have used text XML instead.`
          ).toBeGreaterThan(0);
        },
        TIMEOUT
      );

      (opencodeShouldRun ? it.concurrent : it.skip)(
        "emits tool calls (any format: proper or XML)",
        async () => {
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode Zen", true, MODEL);
          const parser = new StreamToolParser();
          const properCalls: ToolCallRequest[] = [];

          await provider.chatStream(
            [
              { role: "system", content: prompts.system },
              { role: "user", content: prompts.user },
            ],
            (token) => { parser.feed(token); },
            (tc) => { properCalls.push(tc); },
            hostTools,
            { apiKey: OPENCODE_API_KEY, model: MODEL, maxTokens: 4096, baseUrl: BASE_URL, useLegacyChatCompletions: true }
          );

          const synthNames = parser.getCapturedTools();
          const knownNames = new Set(toolRegistry.listNames());
          const validSynth = synthNames.filter((n) => knownNames.has(n));
          const allNames = [
            ...properCalls.map((c) => c.function.name),
            ...validSynth,
          ];

          expect(
            allNames.length,
            `${MODEL}/${host}: No tool calls found. proper=[${properCalls.map(c => c.function.name)}] synth=[${synthNames.filter(n => knownNames.has(n))}]`
          ).toBeGreaterThan(0);
        },
        TIMEOUT
      );

      (opencodeShouldRun ? it.concurrent : it.skip)(
        "full loop: call tool → execute → model responds",
        async () => {
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode Zen", true, MODEL);
          const parser = new StreamToolParser();
          let properCalls: ToolCallRequest[] = [];
          let textContent = "";

          const messages: Array<{
            role: string;
            content: string | null;
            tool_calls?: ToolCallRequest[];
            tool_call_id?: string;
            name?: string;
          }> = [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ];

          // Step 1: Model calls tool
          await provider.chatStream(
            messages as any,
            (token) => { parser.feed(token); textContent += token; },
            (tc) => { properCalls.push(tc); },
            hostTools,
            { apiKey: OPENCODE_API_KEY, model: MODEL, maxTokens: 4096, baseUrl: BASE_URL, useLegacyChatCompletions: true }
          );

          const synthNames = parser.getCapturedTools();
          const knownNames = new Set(toolRegistry.listNames());
          const synthCalls = synthNames
            .filter((n) => knownNames.has(n))
            .map((n) => makeToolCall(n));

          const allCalls = [...properCalls];
          for (const sc of synthCalls) {
            if (!allCalls.some((c) => c.function.name === sc.function.name)) {
              allCalls.push(sc);
            }
          }

          expect(
            allCalls.length,
            `${MODEL}/${host}: Model did not call any tool in step 1`
          ).toBeGreaterThan(0);

          // Step 2: Execute tools
          messages.push({ role: "assistant", content: textContent || null, tool_calls: allCalls });

          for (const tc of allCalls) {
            const result = await mockExecuteTool(tc.function.name);
            messages.push({
              role: "tool", content: result,
              tool_call_id: tc.id, name: tc.function.name,
            });
          }

          // Step 3: Model continues
          parser.reset();
          properCalls = [];
          textContent = "";
          await provider.chatStream(
            messages as any,
            (token) => { parser.feed(token); textContent += token; },
            (tc) => { properCalls.push(tc); },
            hostTools,
            { apiKey: OPENCODE_API_KEY, model: MODEL, maxTokens: 4096, baseUrl: BASE_URL, useLegacyChatCompletions: true }
          );

          const responded = textContent.length > 0 || properCalls.length > 0;
          expect(
            responded,
            `${MODEL}/${host}: Model stalled after tool result (no text, no tool calls)`
          ).toBe(true);
        },
        TIMEOUT
      );
    });
  }
}

// --- OpenAI ---

const OPENAI_MODEL = "gpt-4o-mini";

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  describe(`OpenAI — ${host}`, () => {
    (openaiShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (non-streaming chat)",
      async () => {
        const provider = new OpenAICompatibleProvider("openai", "OpenAI", true, OPENAI_MODEL);
        const response = await provider.chat(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          hostTools,
          {
            apiKey: OPENAI_API_KEY,
            model: OPENAI_MODEL,
            maxTokens: 4096,
            baseUrl: "https://api.openai.com/v1",
            useLegacyChatCompletions: true,
          }
        );

        expect(
          response.toolCalls.length,
          `${host}: Tool calls: ${response.toolCalls.map(c => c.function.name).join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    (openaiShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (streaming)",
      async () => {
        const provider = new OpenAICompatibleProvider("openai", "OpenAI", true, OPENAI_MODEL);
        const properCalls: ToolCallRequest[] = [];

        await provider.chatStream(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          () => {},
          (tc) => { properCalls.push(tc); },
          hostTools,
          {
            apiKey: OPENAI_API_KEY,
            model: OPENAI_MODEL,
            maxTokens: 4096,
            baseUrl: "https://api.openai.com/v1",
            useLegacyChatCompletions: true,
          }
        );

        const toolNames = properCalls.map(c => c.function.name);
        expect(
          toolNames.length,
          `${host}: Tool calls via streaming: ${toolNames.join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );
  });
}

// --- Google Gemini ---

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  describe(`Google Gemini — ${host}`, () => {
    (geminiShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (non-streaming chat)",
      async () => {
        const { GeminiProvider } = await import("../../providers/gemini");
        const provider = new GeminiProvider();
        const response = await provider.chat(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          hostTools,
          { apiKey: GEMINI_API_KEY, model: "gemini-3.5-flash-lite", maxTokens: 4096 }
        );

        expect(
          response.toolCalls.length,
          `${host}: Tool calls: ${response.toolCalls.map(c => c.function.name).join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    (geminiShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (streaming)",
      async () => {
        const { GeminiProvider } = await import("../../providers/gemini");
        const provider = new GeminiProvider();
        const properCalls: ToolCallRequest[] = [];

        await provider.chatStream(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          () => {},
          (tc) => { properCalls.push(tc); },
          hostTools,
          { apiKey: GEMINI_API_KEY, model: "gemini-3.5-flash-lite", maxTokens: 4096 }
        );

        const toolNames = properCalls.map(c => c.function.name);
        expect(
          toolNames.length,
          `${host}: Tool calls via streaming: ${toolNames.join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );
  });
}

// --- Anthropic Claude ---

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  describe(`Anthropic Claude — ${host}`, () => {
    (anthropicShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (non-streaming chat)",
      async () => {
        const { AnthropicProvider } = await import("../../providers/anthropic");
        const provider = new AnthropicProvider();
        const response = await provider.chat(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          hostTools,
          { apiKey: ANTHROPIC_API_KEY, model: "claude-haiku-4-5", maxTokens: 4096 }
        );

        expect(
          response.toolCalls.length,
          `${host}: Tool calls: ${response.toolCalls.map(c => c.function.name).join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    (anthropicShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (streaming)",
      async () => {
        const { AnthropicProvider } = await import("../../providers/anthropic");
        const provider = new AnthropicProvider();
        const properCalls: ToolCallRequest[] = [];

        await provider.chatStream(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          () => {},
          (tc) => { properCalls.push(tc); },
          hostTools,
          { apiKey: ANTHROPIC_API_KEY, model: "claude-haiku-4-5", maxTokens: 4096 }
        );

        const toolNames = properCalls.map(c => c.function.name);
        expect(
          toolNames.length,
          `${host}: Tool calls via streaming: ${toolNames.join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );
  });
}