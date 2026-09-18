/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration tests for tool calling with real providers.
 *
 * Every provider (OpenAI-compatible / OpenCode, Gemini, Anthropic) is run
 * against the tool set of every host (Word, Excel, PowerPoint). This catches
 * provider-side schema regressions — e.g. a JSON-Schema construct that one
 * provider accepts and another rejects (see write_range's union type).
 *
 * Run with:
 *   OPENCODE_API_KEY=sk-... OPENAI_API_KEY=... GEMINI_API_KEY=... ANTHROPIC_API_KEY=... DEEPSEEK_API_KEY=... \
 *     npm test -- src/__tests__/providers/integration.test.ts
 *
 * Each provider's suite is skipped when its key is not set (CI-safe).
 */

import { beforeAll, describe, it, expect } from "vitest";
import { toolRegistry } from "../../tools";
import { StreamToolParser } from "../../chat/toolCallParser";
import { OpenAICompatibleProvider } from "../../providers/openai";
import { selectToolsForMode, WRITE_TOOLS } from "../../chat/writeTools";
import {
  appendCustomInstructions,
  buildSystemPrompt,
  SUGGESTION_MODE_RULES,
} from "../../chat/agentLoop";
import type {
  ChatOptions,
  LLMMessage,
  LLMProvider,
  ToolCallRequest,
  ToolDefinition,
} from "../../providers/types";

import "../../tools";

const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
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
const deepseekShouldRun = !!DEEPSEEK_API_KEY;

// Make live coverage explicit in CI logs: a provider skipped for a missing
// secret must not look like it was tested.
beforeAll(() => {
  const flags: Array<[string, boolean]> = [
    ["OpenCode", opencodeShouldRun],
    ["OpenAI", openaiShouldRun],
    ["DeepSeek", deepseekShouldRun],
    ["Gemini", geminiShouldRun],
    ["Anthropic", anthropicShouldRun],
  ];
  const enabled = flags.filter(([, on]) => on).map(([name]) => name);
  const skipped = flags.filter(([, on]) => !on).map(([name]) => name);
  // process.stdout.write (not console.log) so the line is never swallowed by
  // Vitest's console interceptor and always shows up in CI output.
  process.stdout.write(
    `\n[integration] live providers: ${enabled.join(", ") || "none"} | skipped (no key): ${skipped.join(", ") || "none"}\n`
  );
});

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

// --- OpenAI-compatible (OpenCode) ---

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  for (const MODEL of ALL_MODELS) {
    // Thinking-mode models on OpenCode Go (e.g. deepseek-v4-flash) require
    // `reasoning_content` on every assistant message once `tools` is present,
    // so the loop test must echo it back like the agent loop does.
    const opencodeOpts = {
      apiKey: OPENCODE_API_KEY,
      model: MODEL,
      maxTokens: 4096,
      baseUrl: BASE_URL,
      useLegacyChatCompletions: true,
      customHeaders: { "x-opencode-session": "integration-test-session" },
      echoReasoningContent: true,
    };

    describe(`OpenCode — ${MODEL} — ${host}`, () => {
      (opencodeShouldRun ? it.concurrent : it.skip)(
        "emits tool calls via delta.tool_calls",
        async () => {
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode", true, MODEL);
          const properCalls: ToolCallRequest[] = [];

          await provider.chatStream(
            [
              { role: "system", content: prompts.system },
              { role: "user", content: prompts.user },
            ],
            () => {},
            (tc) => { properCalls.push(tc); },
            hostTools,
            opencodeOpts
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
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode", true, MODEL);
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
            opencodeOpts
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
        "full loop: call tool → execute → model responds (thinking mode)",
        async () => {
          const provider = new OpenAICompatibleProvider("opencode", "OpenCode", true, MODEL);
          const parser = new StreamToolParser();
          let properCalls: ToolCallRequest[] = [];
          let textContent = "";
          let reasoningText = "";

          const messages: Array<Record<string, unknown>> = [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ];

          // Step 1: Model calls tool
          await provider.chatStream(
            messages as any,
            (token) => { parser.feed(token); textContent += token; },
            (tc) => { properCalls.push(tc); },
            hostTools,
            opencodeOpts,
            (token) => { reasoningText += token; }
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
          messages.push({
            role: "assistant",
            content: textContent || null,
            tool_calls: allCalls,
            ...(reasoningText ? { reasoningContent: reasoningText } : {}),
          });

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
          reasoningText = "";
          await provider.chatStream(
            messages as any,
            (token) => { parser.feed(token); textContent += token; },
            (tc) => { properCalls.push(tc); },
            hostTools,
            opencodeOpts,
            (token) => { reasoningText += token; }
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

// --- DeepSeek ---

const DEEPSEEK_MODEL = "deepseek-v4-flash";

for (const host of HOSTS) {
  const prompts = HOST_PROMPTS[host];
  const hostTools = getTestTools(host);

  // Mirrors the DeepSeek preset: legacy chat completions + reasoning echo
  // (thinking mode requires reasoning_content on every assistant message).
  const deepseekOpts = {
    apiKey: DEEPSEEK_API_KEY,
    model: DEEPSEEK_MODEL,
    maxTokens: 4096,
    baseUrl: "https://api.deepseek.com",
    useLegacyChatCompletions: true,
    echoReasoningContent: true,
  };

  describe(`DeepSeek — ${host}`, () => {
    (deepseekShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (non-streaming chat)",
      async () => {
        const provider = new OpenAICompatibleProvider("deepseek", "DeepSeek", true, DEEPSEEK_MODEL);
        const response = await provider.chat(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          hostTools,
          deepseekOpts
        );

        expect(
          response.toolCalls.length,
          `${host}: Tool calls: ${response.toolCalls.map(c => c.function.name).join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    (deepseekShouldRun ? it.concurrent : it.skip)(
      "emits tool calls (streaming)",
      async () => {
        const provider = new OpenAICompatibleProvider("deepseek", "DeepSeek", true, DEEPSEEK_MODEL);
        const properCalls: ToolCallRequest[] = [];

        await provider.chatStream(
          [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
          ],
          () => {},
          (tc) => { properCalls.push(tc); },
          hostTools,
          deepseekOpts
        );

        const toolNames = properCalls.map(c => c.function.name);
        expect(
          toolNames.length,
          `${host}: Tool calls via streaming: ${toolNames.join(", ") || "none"}`
        ).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    (deepseekShouldRun ? it.concurrent : it.skip)(
      "full loop: echo reasoning_content across tool calls (thinking mode)",
      async () => {
        const provider = new OpenAICompatibleProvider("deepseek", "DeepSeek", true, DEEPSEEK_MODEL);
        const parser = new StreamToolParser();
        let properCalls: ToolCallRequest[] = [];
        let textContent = "";
        let reasoningText = "";

        const messages: Array<Record<string, unknown>> = [
          { role: "system", content: prompts.system },
          { role: "user", content: prompts.user },
        ];

        // Step 1: model thinks and calls a tool
        await provider.chatStream(
          messages as any,
          (token) => { parser.feed(token); textContent += token; },
          (tc) => { properCalls.push(tc); },
          hostTools,
          deepseekOpts,
          (token) => { reasoningText += token; }
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
          `${host}: Model did not call any tool in step 1`
        ).toBeGreaterThan(0);

        // Step 2: execute tools; echo reasoning_content verbatim. DeepSeek
        // returns 400 if the assistant message lacks it.
        messages.push({
          role: "assistant",
          content: textContent || null,
          tool_calls: allCalls,
          reasoningContent: reasoningText,
        });

        for (const tc of allCalls) {
          const result = await mockExecuteTool(tc.function.name);
          messages.push({
            role: "tool", content: result,
            tool_call_id: tc.id, name: tc.function.name,
          });
        }

        // Step 3: model continues
        parser.reset();
        properCalls = [];
        textContent = "";
        await provider.chatStream(
          messages as any,
          (token) => { parser.feed(token); textContent += token; },
          (tc) => { properCalls.push(tc); },
          hostTools,
          deepseekOpts,
          (token) => { reasoningText += token; }
        );

        const responded = textContent.length > 0 || properCalls.length > 0;
        expect(
          responded,
          `${host}: Model stalled after tool result (no text, no tool calls)`
        ).toBe(true);
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

// --- Suggestion mode (read-only review) ---

const SUGGESTION_USER: Record<"word" | "excel", string> = {
  word:
    'Find the sentence about "Madrid" and call add_suggestion with target_text "Madrid" and text "Consider expanding this sentence."',
  excel: 'Call add_suggestion with cell "B4" and text "Consider renaming this column."',
};

function suggestionToolsForHost(host: string): ToolDefinition[] {
  return selectToolsForMode(getTestTools(host), true);
}

/** Real production suggestion-mode system prompt for a host. */
function suggestionSystemPrompt(host: "word" | "excel"): string {
  return appendCustomInstructions(
    buildSystemPrompt(suggestionToolsForHost(host), 100, host),
    undefined,
    [
      {
        tag: "suggestion_mode",
        body: SUGGESTION_MODE_RULES,
        note: "The suggestion_mode rules above take precedence over any conflicting instruction in this prompt.",
      },
    ]
  );
}

async function capturedSuggestionTools(
  provider: LLMProvider,
  host: "word" | "excel",
  options: ChatOptions
): Promise<string[]> {
  const tools = suggestionToolsForHost(host);
  const known = new Set(tools.map((t) => t.name));
  const collected = new Set<string>();

  const messages: LLMMessage[] = [
    { role: "system", content: suggestionSystemPrompt(host) },
    { role: "user", content: SUGGESTION_USER[host] },
  ];

  // Models commonly read/search first to locate the anchor, then suggest. Run a
  // short loop (max 3 steps) feeding mock tool results until add_suggestion shows
  // up, mirroring how the agent loop would drive the provider.
  for (let step = 0; step < 3; step++) {
    const parser = new StreamToolParser();
    const proper: ToolCallRequest[] = [];
    let text = "";
    await provider.chatStream(
      messages,
      (token) => { parser.feed(token); text += token; },
      (tc) => proper.push(tc),
      tools,
      options
    );

    const synthNames = parser.getCapturedTools().filter((n) => known.has(n));
    const calls = [...proper];
    for (const name of synthNames) {
      if (!calls.some((c) => c.function.name === name)) {
        calls.push({ id: `synth_${name}`, type: "function", function: { name, arguments: "{}" } });
      }
    }

    if (calls.length === 0) break;
    for (const c of calls) collected.add(c.function.name);
    if (collected.has("add_suggestion")) break;

    messages.push({ role: "assistant", content: text || null, tool_calls: calls });
    for (const c of calls) {
      messages.push({
        role: "tool",
        content: JSON.stringify({
          success: true,
          results: [{ text: host === "excel" ? "Column B header." : "Madrid is a great city." }],
        }),
        tool_call_id: c.id,
        name: c.function.name,
      });
    }
  }

  return [...collected];
}

describe("Suggestion mode — providers accept the review tool set", () => {
  it("exposes add_suggestion and hides write tools (Word and Excel)", () => {
    for (const host of ["word", "excel"] as const) {
      const names = suggestionToolsForHost(host).map((t) => t.name);
      expect(names, `${host}: add_suggestion missing`).toContain("add_suggestion");
      expect(names, `${host}: execute_office_js leaked`).not.toContain("execute_office_js");
    }
    expect(suggestionToolsForHost("word").map((t) => t.name)).not.toContain("edit_doc_text");
    expect(suggestionToolsForHost("excel").map((t) => t.name)).not.toContain("write_range");
  });

  const providerCases: Array<{
    label: string;
    shouldRun: boolean;
    provider: () => Promise<LLMProvider>;
    options: () => ChatOptions;
  }> = [
    {
      label: "OpenCode",
      shouldRun: opencodeShouldRun,
      provider: async () =>
        new OpenAICompatibleProvider("opencode", "OpenCode", true, "deepseek-v4-flash"),
      options: () => ({
        apiKey: OPENCODE_API_KEY,
        model: "deepseek-v4-flash",
        maxTokens: 4096,
        baseUrl: BASE_URL,
        useLegacyChatCompletions: true,
        customHeaders: { "x-opencode-session": "suggestion-mode-test" },
        echoReasoningContent: true,
      }),
    },
    {
      label: "OpenAI",
      shouldRun: openaiShouldRun,
      provider: async () => new OpenAICompatibleProvider("openai", "OpenAI", true, OPENAI_MODEL),
      options: () => ({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL,
        maxTokens: 4096,
        baseUrl: "https://api.openai.com/v1",
        useLegacyChatCompletions: true,
      }),
    },
    {
      label: "DeepSeek",
      shouldRun: deepseekShouldRun,
      provider: async () => new OpenAICompatibleProvider("deepseek", "DeepSeek", true, DEEPSEEK_MODEL),
      options: () => ({
        apiKey: DEEPSEEK_API_KEY,
        model: DEEPSEEK_MODEL,
        maxTokens: 4096,
        baseUrl: "https://api.deepseek.com",
        useLegacyChatCompletions: true,
        echoReasoningContent: true,
      }),
    },
    {
      label: "Gemini",
      shouldRun: geminiShouldRun,
      provider: async () => {
        const { GeminiProvider } = await import("../../providers/gemini");
        return new GeminiProvider();
      },
      options: () => ({
        apiKey: GEMINI_API_KEY,
        model: "gemini-3.5-flash-lite",
        maxTokens: 4096,
      }),
    },
    {
      label: "Anthropic",
      shouldRun: anthropicShouldRun,
      provider: async () => {
        const { AnthropicProvider } = await import("../../providers/anthropic");
        return new AnthropicProvider();
      },
      options: () => ({
        apiKey: ANTHROPIC_API_KEY,
        model: "claude-haiku-4-5",
        maxTokens: 4096,
      }),
    },
  ];

  for (const host of ["word", "excel"] as const) {
    for (const c of providerCases) {
      (c.shouldRun ? it.concurrent : it.skip)(
        `${c.label} — ${host} — calls add_suggestion`,
        async () => {
          const provider = await c.provider();
          const names = await capturedSuggestionTools(provider, host, c.options());
          expect(names, `${c.label}/${host}: tool calls = [${names.join(", ")}]`).toContain(
            "add_suggestion"
          );
          expect(
            names.filter((n) => WRITE_TOOLS.has(n)),
            `${c.label}/${host}: write tools must never be emitted`
          ).toEqual([]);
        },
        TIMEOUT
      );
    }
  }
});