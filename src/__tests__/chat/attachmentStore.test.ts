import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../../store/chatStore";
import type { Attachment } from "../../chat/types";

function att(id: string): Attachment {
  return {
    id,
    name: `${id}.txt`,
    mime: "text/plain",
    size: 1,
    kind: "text",
    status: "extracting",
  };
}

beforeEach(() => {
  useChatStore.setState({ messages: [], modelHistory: [], attachments: [] });
});

describe("chatStore — attachments", () => {
  it("adds, updates, and removes attachments", () => {
    const s = useChatStore.getState();
    s.addAttachment(att("a"));
    s.addAttachment(att("b"));
    expect(useChatStore.getState().attachments.map((a) => a.id)).toEqual(["a", "b"]);

    s.updateAttachment("a", { status: "ready", text: "hello" });
    expect(useChatStore.getState().attachments[0]).toMatchObject({ status: "ready", text: "hello" });

    s.removeAttachment("a");
    expect(useChatStore.getState().attachments.map((a) => a.id)).toEqual(["b"]);
  });

  it("attaches files to a user message and clears the queue", () => {
    const s = useChatStore.getState();
    s.addAttachment(att("a"));
    s.updateAttachment("a", { status: "ready", text: "body" });
    const files = useChatStore.getState().attachments;

    const msg = s.addUserMessage("summarize", files);
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments?.[0].name).toBe("a.txt");

    s.clearAttachments();
    expect(useChatStore.getState().attachments).toEqual([]);
  });

  it("clearMessages resets attachments", () => {
    const s = useChatStore.getState();
    s.addAttachment(att("a"));
    s.clearMessages();
    expect(useChatStore.getState().attachments).toEqual([]);
  });
});
