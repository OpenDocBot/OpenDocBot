import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAgentLoop, MAX_AGENT_ITERATIONS, extractToolError } from "../../chat/agentLoop";
import { toolRegistry } from "../../tools/registry";
import { clearDebugLogs, getDebugLogs } from "../../lib/debugLog";
import type { LLMProvider, ModelInfo, LLMMessage, ToolCallRequest, ToolDefinition, ChatOptions } from "../../providers/types";

interface StreamStep {
  content?: string | null;
  toolCalls?: ToolCallRequest[];
}

function createMockProvider(steps: StreamStep[]): LLMProvider {
  let callIndex = 0;
  return {
    id: "mock", label: "Mock", requiresKey: false, defaultModel: "mock",
    async listModels(): Promise<ModelInfo[]> { return []; },
    async chat() { throw new Error("not used"); },
    async chatStream(
      _messages: LLMMessage[],
      onToken: (token: string) => void,
      onToolCall: (toolCall: ToolCallRequest) => void,
      _tools: ToolDefinition[],
      _options: ChatOptions
    ): Promise<void> {
      const step = steps[callIndex] ?? { content: "Fallback" };
      callIndex++;
      const content = step.content ?? "";
      for (const char of [...content]) onToken(char);
      if (step.toolCalls) for (const tc of step.toolCalls) onToolCall(tc);
    },
  };
}

const opts = { apiKey: "", model: "mock", maxTokens: 100 };

beforeEach(() => {
  toolRegistry.register(
    { name: "test_tool", description: "Test tool", parameters: { type: "object", properties: {} } },
    async (args) => JSON.stringify({ result: "ok", args })
  );
  toolRegistry.register(
    { name: "get_selection", description: "Read selection", parameters: { type: "object", properties: {} } },
    async () => JSON.stringify({ text: "sample" })
  );
  toolRegistry.register(
    { name: "replace_selection", description: "Replace selection",
      parameters: { type: "object", properties: { new_text: { type: "string" } }, required: ["new_text"] } },
    async (args) => JSON.stringify({ replaced: args.new_text })
  );
  toolRegistry.register(
    { name: "failing_tool", description: "Fails", parameters: { type: "object", properties: {} } },
    async () => { throw new Error("Tool failure"); }
  );
});

afterEach(() => { vi.restoreAllMocks(); clearDebugLogs(); });

describe("extractToolError", () => {
  it("extracts a string error message", () => {
    expect(extractToolError(JSON.stringify({ error: "boom" }))).toBe("boom");
  });

  it("extracts an object error with a message field", () => {
    expect(extractToolError(JSON.stringify({ error: { message: "deep failure" } }))).toBe(
      "deep failure"
    );
  });

  it("returns undefined for non-error results", () => {
    expect(extractToolError(JSON.stringify({ success: true }))).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(extractToolError("not json")).toBeUndefined();
  });
});

describe("runAgentLoop — basic", () => {
  it("streams text token by token", async () => {
    const p = createMockProvider([{ content: "Hello!" }]);
    const tokens: string[] = [];
    const r = await runAgentLoop(p, "Hi", opts, { onToken: (t) => tokens.push(t) });
    expect(tokens.join("")).toBe("Hello!");
    expect(r.content).toBe("Hello!");
    expect(r.iterations).toBe(1);
    expect(r.finishReason).toBe("stop");
  });

  it("handles empty content", async () => {
    const p = createMockProvider([{ content: "" }]);
    const r = await runAgentLoop(p, "Hi", opts);
    expect(r.content).toBe("");
  });

  it("handles null content", async () => {
    const p = createMockProvider([{ content: null }]);
    const r = await runAgentLoop(p, "Hi", opts);
    expect(r.content).toBe("");
  });
});

describe("runAgentLoop — tool execution", () => {
  it("executes tool and loops to next iteration", async () => {
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "Done" },
    ]);
    const starts: string[] = [];
    const r = await runAgentLoop(p, "run", opts, { onToolStart: (n) => starts.push(n) });
    expect(starts).toEqual(["test_tool"]);
    expect(r.iterations).toBe(2);
  });

  it("streams preamble text before tool calls", async () => {
    const p = createMockProvider([
      { content: "Let me check...", toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "All done" },
    ]);
    const tokens: string[] = [];
    await runAgentLoop(p, "check", opts, { onToken: (t) => tokens.push(t) });
    expect(tokens.join("")).toBe("Let me check...All done");
  });

  it("executes multiple tools in one response", async () => {
    const p = createMockProvider([
      { toolCalls: [
        { id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } },
        { id: "c2", type: "function", function: { name: "test_tool", arguments: '{"step":2}' } },
      ] },
      { content: "Done" },
    ]);
    const starts: string[] = [];
    await runAgentLoop(p, "two", opts, { onToolStart: (n) => starts.push(n) });
    expect(starts).toEqual(["test_tool", "test_tool"]);
  });

  it("deduplicates identical parallel tool calls (model repetition)", async () => {
    const p = createMockProvider([
      { toolCalls: [
        { id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } },
        { id: "c2", type: "function", function: { name: "test_tool", arguments: "{}" } },
      ] },
      { content: "Done" },
    ]);
    const starts: string[] = [];
    await runAgentLoop(p, "dup", opts, { onToolStart: (n) => starts.push(n) });
    expect(starts).toEqual(["test_tool"]);
  });

  it("handles invalid JSON arguments", async () => {
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "not json {{{" } }] },
      { content: "Ok" },
    ]);
    const r = await runAgentLoop(p, "bad", opts);
    expect(r.finishReason).toBe("stop");
  });

  it("handles failing tool gracefully", async () => {
    clearDebugLogs();
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "failing_tool", arguments: "{}" } }] },
      { content: "Tried" },
    ]);
    const r = await runAgentLoop(p, "fail", opts);
    expect(r.iterations).toBe(2);

    // The debug log should include the tool name AND the error reason.
    const logLines = getDebugLogs().map((l) => l.msg);
    const errorLine = logLines.find((m) => m.includes("failing_tool") && m.includes("ERROR"));
    expect(errorLine).toBeDefined();
    expect(errorLine).toContain("Tool failure");
  });

  it("stops after repeated identical tool failures (thrash guard)", async () => {
    // The model keeps issuing the exact same failing call three times.
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "failing_tool", arguments: "{}" } }] },
      { toolCalls: [{ id: "c2", type: "function", function: { name: "failing_tool", arguments: "{}" } }] },
      { toolCalls: [{ id: "c3", type: "function", function: { name: "failing_tool", arguments: "{}" } }] },
      { content: "Never reached" },
    ]);
    const r = await runAgentLoop(p, "stuck", opts);
    expect(r.finishReason).toBe("error");
    expect(r.iterations).toBeLessThan(4);
    expect(r.content).toContain("failing_tool");
  });

  it("does not trip the thrash guard when failures differ", async () => {
    // Two different failing calls should not abort.
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "failing_tool", arguments: '{"a":1}' } }] },
      { toolCalls: [{ id: "c2", type: "function", function: { name: "failing_tool", arguments: '{"a":2}' } }] },
      { content: "Ok" },
    ]);
    const r = await runAgentLoop(p, "mixed", opts);
    expect(r.finishReason).toBe("stop");
    expect(r.content).toBe("Ok");
  });

  it("handles unknown tool gracefully", async () => {
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "gone", arguments: "{}" } }] },
      { content: "Not found" },
    ]);
    const r = await runAgentLoop(p, "unknown", opts);
    expect(r.content).toBe("Not found");
  });

  it("fires onToolStart and onToolEnd", async () => {
    const p = createMockProvider([
      { toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "Done" },
    ]);
    const starts: string[] = [];
    let ends = 0;
    await runAgentLoop(p, "test", opts, { onToolStart: (n) => starts.push(n), onToolEnd: () => ends++ });
    expect(starts).toEqual(["test_tool"]);
    expect(ends).toBe(1);
  });
});

describe("runAgentLoop — human in the loop approval", () => {
  function toolStep(name: string): StreamStep {
    return {
      toolCalls: [{ id: "c1", type: "function", function: { name, arguments: "{}" } }],
    };
  }

  it("executes the tool when approval resolves true", async () => {
    const p = createMockProvider([toolStep("test_tool"), { content: "Done" }]);
    const starts: string[] = [];
    const approvals: string[] = [];
    const r = await runAgentLoop(p, "run", opts, {
      onToolStart: (n) => starts.push(n),
      onToolApproval: async (tc) => {
        approvals.push(tc.function.name);
        return true;
      },
    });
    expect(approvals).toEqual(["test_tool"]);
    expect(starts).toEqual(["test_tool"]);
    expect(r.iterations).toBe(2);
    expect(r.finishReason).toBe("stop");
  });

  it("skips the tool and feeds back a rejection when approval resolves false", async () => {
    const p = createMockProvider([toolStep("test_tool"), { content: "I'll stop then." }]);
    const starts: string[] = [];
    let history: LLMMessage[] = [];
    const r = await runAgentLoop(p, "run", opts, {
      onToolStart: (n) => starts.push(n),
      onToolApproval: async () => false,
      onHistoryChange: (msgs) => { history = msgs; },
    });
    expect(starts).toEqual(["test_tool"]);
    expect(r.iterations).toBe(2);
    const toolResults = history.filter((m) => m.role === "tool");
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].content).toContain("User rejected");
    expect(toolResults[0].tool_call_id).toBe("c1");
  });

  it("does not gate when onToolApproval is absent", async () => {
    const p = createMockProvider([toolStep("test_tool"), { content: "Done" }]);
    const starts: string[] = [];
    const r = await runAgentLoop(p, "run", opts, { onToolStart: (n) => starts.push(n) });
    expect(starts).toEqual(["test_tool"]);
    expect(r.iterations).toBe(2);
  });

  it("stops the loop when aborted while awaiting approval", async () => {
    const controller = new AbortController();
    const p = createMockProvider([toolStep("test_tool")]);
    const p2 = runAgentLoop(p, "run", { ...opts, signal: controller.signal }, {
      onToolApproval: () => new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 20);
      }),
    });
    setTimeout(() => controller.abort(), 5);
    const r = await p2;
    expect(r.finishReason).toBe("stop");
  });
});

describe("runAgentLoop — multi-step chains", () => {
  it("get_selection → replace_selection", async () => {
    const p = createMockProvider([
      { toolCalls: [{ id: "read", type: "function", function: { name: "get_selection", arguments: "{}" } }] },
      { toolCalls: [{ id: "write", type: "function", function: { name: "replace_selection", arguments: '{"new_text":"hi"}' } }] },
      { content: "Done" },
    ]);
    const r = await runAgentLoop(p, "change", opts);
    expect(r.iterations).toBe(3);
  });
});

describe("runAgentLoop — max iterations", () => {
  it("stops at MAX_AGENT_ITERATIONS", async () => {
    const steps: StreamStep[] = [];
    for (let i = 0; i < MAX_AGENT_ITERATIONS + 2; i++) {
      steps.push({ toolCalls: [{ id: `c${i}`, type: "function", function: { name: "test_tool", arguments: "{}" } }] });
    }
    const r = await runAgentLoop(createMockProvider(steps), "loop", opts);
    expect(r.iterations).toBe(MAX_AGENT_ITERATIONS);
    expect(r.finishReason).toBe("max_iterations");
  });

  it("honors a custom maxIterations value", async () => {
    const steps: StreamStep[] = [];
    for (let i = 0; i < 5; i++) {
      steps.push({ toolCalls: [{ id: `c${i}`, type: "function", function: { name: "test_tool", arguments: "{}" } }] });
    }
    const r = await runAgentLoop(createMockProvider(steps), "loop", opts, {}, [], undefined, undefined, 3);
    expect(r.iterations).toBe(3);
    expect(r.finishReason).toBe("max_iterations");
  });
});

describe("runAgentLoop — error handling", () => {
  it("propagates chatStream errors", async () => {
    const p: LLMProvider = {
      id: "err", label: "Err", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(): Promise<void> { throw new Error("Down"); },
    };
    await expect(runAgentLoop(p, "test", opts)).rejects.toThrow("Down");
  });

  it("propagates mid-loop errors after first stream succeeds", async () => {
    let n = 0;
    const p: LLMProvider = {
      id: "err2", label: "Err2", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(_m: LLMMessage[], _onToken: (t: string) => void, onToolCall: (tc: ToolCallRequest) => void, _tools: ToolDefinition[], _o: ChatOptions): Promise<void> {
        if (++n === 1) { onToolCall({ id: "c", type: "function", function: { name: "test_tool", arguments: "{}" } }); return; }
        throw new Error("Second failed");
      },
    };
    await expect(runAgentLoop(p, "test", opts)).rejects.toThrow("Second failed");
  });
});

describe("runAgentLoop — unicode", () => {
  it("streams emoji", async () => {
    const p = createMockProvider([{ content: "Got it! 🚀" }]);
    const r = await runAgentLoop(p, "🌟", opts);
    expect(r.content).toBe("Got it! 🚀");
  });

  it("streams RTL", async () => {
    const p = createMockProvider([{ content: "تم" }]);
    const r = await runAgentLoop(p, "مرحبا", opts);
    expect(r.content).toBe("تم");
  });

  it("accumulates across iterations", async () => {
    const p = createMockProvider([
      { content: "Step1 ", toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "Step2 ", toolCalls: [{ id: "c2", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "Final" },
    ]);
    const tokens: string[] = [];
    const r = await runAgentLoop(p, "multi", opts, { onToken: (t) => tokens.push(t) });
    expect(tokens.join("")).toBe("Step1 Step2 Final");
    expect(r.content).toBe("Final");
    expect(r.iterations).toBe(3);
  });
});

describe("runAgentLoop — host-scoped tools", () => {
  it("offers only host-appropriate tools to the provider (mock excel host)", async () => {
    const g = globalThis as { Office?: unknown };
    const realOffice = g.Office;
    g.Office = {
      onReady: () => {},
      context: { host: "Excel" },
      HostType: { Word: "Word", Excel: "Excel" },
    };

    const offered: string[] = [];
    const p: LLMProvider = {
      id: "host", label: "Host", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(_m: LLMMessage[], _onToken: (t: string) => void, _onToolCall: (tc: ToolCallRequest) => void, tools: ToolDefinition[]): Promise<void> {
        offered.push(...tools.map((t) => t.name));
      },
    };
    await runAgentLoop(p, "hi", opts);

    g.Office = realOffice;

    expect(offered).toContain("read_range");
    expect(offered).toContain("write_range");
    expect(offered).toContain("execute_office_js");
    expect(offered).not.toContain("edit_doc_text");
    expect(offered).not.toContain("read_doc_section");
  });

  it("offers word tools by default (no Office)", async () => {
    const g = globalThis as { Office?: unknown };
    g.Office = undefined;

    const offered: string[] = [];
    const p: LLMProvider = {
      id: "wordhost", label: "WordHost", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(_m: LLMMessage[], _onToken: (t: string) => void, _onToolCall: (tc: ToolCallRequest) => void, tools: ToolDefinition[]): Promise<void> {
        offered.push(...tools.map((t) => t.name));
      },
    };
    await runAgentLoop(p, "hi", opts);

    expect(offered).toContain("edit_doc_text");
    expect(offered).toContain("read_doc_section");
    expect(offered).toContain("execute_office_js");
    expect(offered).not.toContain("read_range");
    expect(offered).not.toContain("write_range");
  });

  it("offers powerpoint tools in a mock powerpoint host", async () => {
    const g = globalThis as { Office?: unknown };
    const realOffice = g.Office;
    g.Office = {
      onReady: () => {},
      context: { host: "PowerPoint" },
      HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
    };

    const offered: string[] = [];
    const p: LLMProvider = {
      id: "ppthost", label: "PowerPointHost", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(_m: LLMMessage[], _onToken: (t: string) => void, _onToolCall: (tc: ToolCallRequest) => void, tools: ToolDefinition[]): Promise<void> {
        offered.push(...tools.map((t) => t.name));
      },
    };
    await runAgentLoop(p, "hi", opts);

    g.Office = realOffice;

    expect(offered).toContain("get_presentation_structure");
    expect(offered).toContain("list_slide_shapes");
    expect(offered).toContain("edit_slide_text");
    expect(offered).toContain("execute_office_js");
    expect(offered).not.toContain("edit_doc_text");
    expect(offered).not.toContain("read_range");
  });
});

describe("runAgentLoop — onHistoryChange", () => {
  it("fires with a growing provider history that includes tool messages", async () => {    const p = createMockProvider([
      { content: "Let me check", toolCalls: [{ id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } }] },
      { content: "Done" },
    ]);
    const snapshots: LLMMessage[][] = [];
    const r = await runAgentLoop(p, "check", opts, { onHistoryChange: (msgs) => snapshots.push([...msgs]) });

    expect(r.finishReason).toBe("stop");
    expect(snapshots.length).toBeGreaterThanOrEqual(3);

    // Snapshot 1: system + user
    expect(snapshots[0][0].role).toBe("system");
    expect(snapshots[0][snapshots[0].length - 1]).toMatchObject({ role: "user", content: "check" });

    // A middle snapshot includes the assistant tool_calls + the tool result
    const withTool = snapshots.find((m) => m.some((x) => x.role === "tool"));
    expect(withTool).toBeDefined();
    expect(withTool!.some((x) => x.role === "assistant" && !!x.tool_calls)).toBe(true);
    expect(withTool!.some((x) => x.role === "tool" && x.name === "test_tool")).toBe(true);

    // Every snapshot is a monotonic extension of the previous one
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].slice(0, snapshots[i - 1].length)).toEqual(snapshots[i - 1]);
    }
  });
});

describe("runAgentLoop — custom instructions", () => {
  function capturingProvider(captured: LLMMessage[][]): LLMProvider {
    return {
      id: "capture", label: "Capture", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(messages: LLMMessage[]): Promise<void> {
        captured.push(messages);
      },
    };
  }

  it("injects custom instructions into the system prompt", async () => {
    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts, {}, [], undefined, "Always use British English.");

    const systemMsg = captured[0][0];
    expect(systemMsg.role).toBe("system");
    expect(systemMsg.content).toContain("<custom_instructions>");
    expect(systemMsg.content).toContain("Always use British English.");
    expect(systemMsg.content).toContain(
      "take precedence over any conflicting general rules"
    );
  });

  it("omits the block when instructions are empty", async () => {
    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts, {}, [], undefined, "");

    const systemMsg = captured[0][0];
    expect(systemMsg.content).not.toContain("<custom_instructions>");
  });

  it("omits the block when instructions are undefined", async () => {
    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts);

    const systemMsg = captured[0][0];
    expect(systemMsg.content).not.toContain("<custom_instructions>");
  });
});

describe("runAgentLoop — task list tools", () => {
  function capturingProvider(captured: LLMMessage[][]): LLMProvider {
    return {
      id: "capture", label: "Capture", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(messages: LLMMessage[]): Promise<void> {
        captured.push(messages);
      },
    };
  }

  it("offers task tools in a mock excel host", async () => {
    const g = globalThis as { Office?: unknown };
    const realOffice = g.Office;
    g.Office = {
      onReady: () => {},
      context: { host: "Excel" },
      HostType: { Word: "Word", Excel: "Excel" },
    };

    const offered: string[] = [];
    const p: LLMProvider = {
      id: "host", label: "Host", requiresKey: false, defaultModel: "",
      async listModels(): Promise<ModelInfo[]> { return []; },
      async chat() { throw new Error("not used"); },
      async chatStream(_m: LLMMessage[], _onToken: (t: string) => void, _onToolCall: (tc: ToolCallRequest) => void, tools: ToolDefinition[]): Promise<void> {
        offered.push(...tools.map((t) => t.name));
      },
    };
    await runAgentLoop(p, "hi", opts);
    g.Office = realOffice;

    expect(offered).toContain("update_todos");
  });

  it("injects the todo list into the user message when tasks exist", async () => {
    const { useTodoStore } = await import("../../store/todoStore");
    useTodoStore.getState().clearTodos();
    useTodoStore.getState().createTasks([
      { title: "Summarize intro", status: "in_progress" },
      { title: "Bold headings" },
    ]);

    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts);

    const userMsg = captured[0][captured[0].length - 1];
    expect(userMsg?.role).toBe("user");
    expect(userMsg?.content).toContain("<todo_list>");
    expect(userMsg?.content).toContain("[in_progress] t1: Summarize intro");
    expect(userMsg?.content).toContain("[pending] t2: Bold headings");
    useTodoStore.getState().clearTodos();
  });

  it("keeps the system prompt stable when tasks exist", async () => {
    const { useTodoStore } = await import("../../store/todoStore");
    useTodoStore.getState().clearTodos();
    useTodoStore.getState().createTasks([{ title: "Stable prompt" }]);

    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts);

    const systemMsg = captured[0][0];
    expect(systemMsg.content).not.toContain("<todo_list>");
    useTodoStore.getState().clearTodos();
  });

  it("omits the todo list block when no tasks exist", async () => {
    const { useTodoStore } = await import("../../store/todoStore");
    useTodoStore.getState().clearTodos();

    const captured: LLMMessage[][] = [];
    const p = capturingProvider(captured);
    await runAgentLoop(p, "Hi", opts);

    const userMsg = captured[0][captured[0].length - 1];
    expect(userMsg?.content).not.toContain("<todo_list>");
  });
});
