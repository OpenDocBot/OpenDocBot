import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../../store/chatStore";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    isLoading: false,
    error: null,
    currentToolName: null,
  });
});

describe("chatStore — messages", () => {
  it("starts empty", () => {
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.isLoading).toBe(false);
  });

  it("addUserMessage creates a message", () => {
    const msg = useChatStore.getState().addUserMessage("Hello");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
  });

  it("addAssistantPlaceholder creates a placeholder", () => {
    const msg = useChatStore.getState().addAssistantPlaceholder();
    expect(msg.role).toBe("assistant");
    expect(msg.isThinking).toBe(true);
  });

  it("appendToken adds to message content", () => {
    const msg = useChatStore.getState().addAssistantPlaceholder();
    useChatStore.getState().appendToken(msg.id, "A");
    useChatStore.getState().appendToken(msg.id, "B");
    // Content is stored in the assistant message
    const m = useChatStore.getState().messages[0];
    expect("role" in m && m.role === "assistant").toBe(true);
    expect((m as { content?: string }).content).toBe("AB");
  });

  it("finalizeMessage sets content and clears flags", () => {
    const msg = useChatStore.getState().addAssistantPlaceholder();
    useChatStore.getState().finalizeMessage(msg.id, "Done");
    const m = useChatStore.getState().messages[0] as { content: string; isStreaming: boolean; isThinking: boolean };
    expect(m.content).toBe("Done");
    expect(m.isStreaming).toBe(false);
    expect(m.isThinking).toBe(false);
  });

  it("clearMessages resets everything", () => {
    useChatStore.getState().addUserMessage("msg");
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages).toEqual([]);
  });
});

describe("chatStore — tool indicator", () => {
  it("sets activeToolLabel on addToolStatusMessage", () => {
    useChatStore.getState().addToolStatusMessage("get_selection");
    expect(useChatStore.getState().activeToolLabel).toBe("get_selection");
  });

  it("sets activeToolLabel to label when provided", () => {
    useChatStore.getState().addToolStatusMessage("execute_office_js", "Cambiando color...");
    expect(useChatStore.getState().activeToolLabel).toBe("Cambiando color...");
  });

  it("updates activeToolLabel on new tool call", () => {
    useChatStore.getState().addToolStatusMessage("get_selection");
    useChatStore.getState().addToolStatusMessage("get_document_text");
    expect(useChatStore.getState().activeToolLabel).toBe("get_document_text");
  });

  it("markLastToolDone is a no-op (indicator stays)", () => {
    useChatStore.getState().addToolStatusMessage("get_selection");
    useChatStore.getState().markLastToolDone();
    expect(useChatStore.getState().activeToolLabel).toBe("get_selection");
  });

  it("setLoading(false) clears activeToolLabel", () => {
    useChatStore.getState().addToolStatusMessage("get_selection");
    useChatStore.getState().setLoading(false);
    expect(useChatStore.getState().activeToolLabel).toBeNull();
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it("tool messages do NOT appear in messages array", () => {
    useChatStore.getState().addAssistantPlaceholder();
    useChatStore.getState().addToolStatusMessage("t1");
    useChatStore.getState().addToolStatusMessage("t2");

    const msgs = useChatStore.getState().messages;
    expect(msgs.length).toBe(1); // only the assistant placeholder
    expect(msgs[0].role).toBe("assistant");
  });
});

describe("chatStore — pendingApproval", () => {
  it("starts null", () => {
    expect(useChatStore.getState().pendingApproval).toBeNull();
  });

  it("setPendingApproval stores approval data", () => {
    useChatStore.getState().setPendingApproval({
      toolName: "execute_office_js",
      label: "Editing document",
      args: { script: "context.document.body.clear();" },
    });
    const p = useChatStore.getState().pendingApproval;
    expect(p).not.toBeNull();
    expect(p!.toolName).toBe("execute_office_js");
    expect(p!.label).toBe("Editing document");
    expect(p!.args).toEqual({ script: "context.document.body.clear();" });
  });

  it("setPendingApproval(null) clears it", () => {
    useChatStore.getState().setPendingApproval({ toolName: "edit_doc_text", args: {} });
    useChatStore.getState().setPendingApproval(null);
    expect(useChatStore.getState().pendingApproval).toBeNull();
  });

  it("clearMessages resets pendingApproval", () => {
    useChatStore.getState().setPendingApproval({ toolName: "edit_doc_text", args: {} });
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().pendingApproval).toBeNull();
  });
});

describe("chatStore — modelHistory", () => {
  beforeEach(() => {
    useChatStore.setState({ modelHistory: [] });
  });

  it("starts empty", () => {
    expect(useChatStore.getState().modelHistory).toEqual([]);
  });

  it("setModelHistory stores the provider conversation", () => {
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "tool" as const, content: '{"ok":true}', name: "test_tool", tool_call_id: "c1" },
    ];
    useChatStore.getState().setModelHistory(history);
    expect(useChatStore.getState().modelHistory).toEqual(history);
  });

  it("clearMessages resets modelHistory", () => {
    useChatStore.getState().setModelHistory([{ role: "user" as const, content: "hi" }]);
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().modelHistory).toEqual([]);
  });
});

describe("chatStore — empty result guard sequence", () => {
  // Mirrors the useChat empty-result guard: when no content and no tool ran,
  // a placeholder is created with a visible note and thinking is cleared.
  it("produces a visible assistant message from a placeholder + appended note", () => {
    const msg = useChatStore.getState().addAssistantPlaceholder();
    useChatStore.getState().appendToken(msg.id, "The model returned an empty response.");
    useChatStore.getState().setThinking(msg.id, false);

    const m = useChatStore.getState().messages.find((x) => x.id === msg.id);
    expect(m).toBeDefined();
    expect(m!.role).toBe("assistant");
    expect(m!.content).toContain("empty response");
    expect(m!.isThinking).toBe(false);
  });
});
