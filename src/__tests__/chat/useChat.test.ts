import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "../../chat/useChat";
import { useChatStore } from "../../store/chatStore";
import { useSettingsStore } from "../../store/settingsStore";
import { stopGeneration } from "../../chat/session";
import type { AgentLoopCallbacks } from "../../chat/agentLoop";
import type { LLMMessage } from "../../providers/types";

// Mock the agent loop so the test controls tool callbacks and the return value.
vi.mock("../../chat/agentLoop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../chat/agentLoop")>();
  return {
    ...actual,
    runAgentLoop: vi.fn(),
  };
});

import { runAgentLoop } from "../../chat/agentLoop";

const mockedRunAgentLoop = vi.mocked(runAgentLoop);

let capturedCallbacks: AgentLoopCallbacks = {};

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: {
      providerId: "custom",
      apiKey: "sk-test",
      model: "test-model",
      baseUrl: "https://test.example.com/v1",
      maxTokens: 4096,
      enableCache: false,
      recacheThreshold: 0,
      useLegacyChatCompletions: false,
      reasoningEffort: "",
      proxyRequests: false,
      anthropicCacheTtl: "5m",
      humanInTheLoop: false,
      maxIterations: 100,
      customInstructions: "",
      openRouterRegion: "global",
    },
  });
  useChatStore.setState({
    messages: [],
    modelHistory: [],
    isLoading: false,
    error: null,
    currentToolName: null,
    activeQuestions: null,
    pendingApproval: null,
  });
  capturedCallbacks = {};
  mockedRunAgentLoop.mockReset();
});

describe("useChat — empty-result guard", () => {
  it("does NOT add an empty-response note when a tool ran (e.g. ask_user_question)", async () => {
    mockedRunAgentLoop.mockImplementation(async (_provider, _text, _opts, callbacks) => {
      capturedCallbacks = callbacks ?? {};
      // Simulate ask_user_question: a tool starts (which resets streaming state).
      capturedCallbacks.onToolStart?.("ask_user_question", "Choosing a style");
      return { content: "", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage("propose options");
    });

    const messages = useChatStore.getState().messages;
    const emptyNotes = messages.filter((m) => m.content?.includes("empty response"));
    expect(emptyNotes).toHaveLength(0);
  });

  it("adds an empty-response note when no content AND no tool ran", async () => {
    mockedRunAgentLoop.mockImplementation(async () => {
      return { content: "", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage("hello");
    });

    const messages = useChatStore.getState().messages;
    const emptyNotes = messages.filter((m) => m.content?.includes("empty response"));
    expect(emptyNotes).toHaveLength(1);
    expect(emptyNotes[0].content).toContain("empty response");
  });

  it("finalizes streamed content normally (no empty-response note)", async () => {
    mockedRunAgentLoop.mockImplementation(async (_provider, _text, _opts, callbacks) => {
      capturedCallbacks = callbacks ?? {};
      capturedCallbacks.onToken?.("Hello there");
      return { content: "Hello there", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    await waitFor(() => {
      const messages = useChatStore.getState().messages;
      expect(messages.some((m) => m.role === "assistant" && m.content?.includes("Hello there"))).toBe(true);
    });

    const messages = useChatStore.getState().messages;
    const emptyNotes = messages.filter((m) => m.content?.includes("empty response"));
    expect(emptyNotes).toHaveLength(0);
  });
});

describe("useChat — custom instructions", () => {
  it("passes customInstructions to runAgentLoop", async () => {
    useSettingsStore.setState({
      config: {
        ...useSettingsStore.getState().config,
        customInstructions: "Always use British English.",
      },
    });
    let capturedCustom: unknown;
    mockedRunAgentLoop.mockImplementation(async (_p, _t, _o, _c, _h, _d, customInstructions) => {
      capturedCustom = customInstructions;
      return { content: "ok", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(capturedCustom).toBe("Always use British English.");
  });

  it("passes an empty string when no custom instructions are set", async () => {
    useSettingsStore.setState({
      config: { ...useSettingsStore.getState().config, customInstructions: "" },
    });
    let capturedCustom: unknown = "unset";
    mockedRunAgentLoop.mockImplementation(async (_p, _t, _o, _c, _h, _d, customInstructions) => {
      capturedCustom = customInstructions;
      return { content: "ok", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.sendMessage("hi");
    });

    expect(capturedCustom).toBe("");
  });
});

describe("useChat — reasoning round-trip (modelHistory)", () => {
  it("persists reasoningContent in modelHistory and passes it back as history", async () => {
    let receivedHistory: unknown;
    mockedRunAgentLoop.mockImplementation(async (_p, _t, _o, callbacks, history) => {
      receivedHistory = history;
      // Simulate the agent loop reporting an assistant message that carried
      // reasoning_content (DeepSeek thinking mode echoes it back).
      callbacks?.onHistoryChange?.([
        {
          role: "assistant",
          content: "plan",
          reasoningContent: "secret thought",
          tool_calls: [
            { id: "c1", type: "function", function: { name: "test_tool", arguments: "{}" } },
          ],
        },
      ]);
      return { content: "ok", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());

    // First turn: the loop's history lands in the store.
    await act(async () => {
      await result.current.sendMessage("first");
    });

    const modelHistory = useChatStore.getState().modelHistory;
    const assistant = modelHistory.find((m) => m.role === "assistant");
    expect(assistant?.reasoningContent).toBe("secret thought");

    // Second turn: the persisted modelHistory is passed back as `history`,
    // so reasoning survives across user messages.
    await act(async () => {
      await result.current.sendMessage("second");
    });

    const history = receivedHistory as LLMMessage[];
    expect(
      history.some((m) => m.role === "assistant" && m.reasoningContent === "secret thought")
    ).toBe(true);
  });
});

describe("useChat — lifecycle (session)", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      config: {
        ...useSettingsStore.getState().config,
        humanInTheLoop: true,
      },
    });
  });

  it("stopGeneration resolves a pending approval so the loop is not stuck", async () => {
    useChatStore.setState({ isLoading: true });
    mockedRunAgentLoop.mockImplementation(async (_provider, _text, opts, callbacks) => {
      const cb = callbacks ?? {};
      capturedCallbacks = cb;
      // Simulate a write tool awaiting HITL approval.
      const approved = await cb.onToolApproval!(
        { id: "c1", type: "function", function: { name: "write_range", arguments: "{}" } },
        {}
      );
      if (opts?.signal?.aborted) return { content: "", iterations: 1, finishReason: "stop" };
      return { content: approved ? "ran" : "skipped", iterations: 1, finishReason: "stop" };
    });

    const { result } = renderHook(() => useChat());
    let sendDone = false;
    const sendPromise = act(async () => {
      await result.current.sendMessage("write some data");
      sendDone = true;
    });

    // Pending approval is now registered.
    expect(useChatStore.getState().pendingApproval).not.toBeNull();

    // Clear/stop while loading: rejects the approval, aborts, and clears UI
    // state — mirroring App's onClearChat.
    await act(async () => {
      stopGeneration();
      useChatStore.getState().clearMessages();
    });

    await sendPromise;
    expect(sendDone).toBe(true);
    expect(useChatStore.getState().pendingApproval).toBeNull();
    // The loop is no longer stuck; session is reset (no error surfaced).
    expect(useChatStore.getState().error).toBeNull();
  });
});
