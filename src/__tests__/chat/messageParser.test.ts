import { describe, it, expect } from "vitest";
import { parseResponse, buildToolResultMessage } from "../../chat/messageParser";
import type { ChatResponse, ToolCallRequest } from "../../providers/types";

describe("parseResponse", () => {
  it("returns type 'text' for plain text response", () => {
    const resp: ChatResponse = {
      id: "1",
      content: "Hello!",
      toolCalls: [],
      finishReason: "stop",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toBe("Hello!");
    expect(parsed.toolCalls).toEqual([]);
  });

  it("returns type 'tool_calls' when only tool calls present", () => {
    const tc: ToolCallRequest = {
      id: "call_1",
      type: "function",
      function: { name: "get_selection", arguments: "{}" },
    };
    const resp: ChatResponse = {
      id: "2",
      content: null,
      toolCalls: [tc],
      finishReason: "tool_calls",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("tool_calls");
    expect(parsed.content).toBe("");
    expect(parsed.toolCalls).toEqual([tc]);
  });

  it("returns type 'mixed' when both text and tool calls present", () => {
    const tc: ToolCallRequest = {
      id: "call_1",
      type: "function",
      function: { name: "get_selection", arguments: "{}" },
    };
    const resp: ChatResponse = {
      id: "3",
      content: "Let me read that...",
      toolCalls: [tc],
      finishReason: "tool_calls",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("mixed");
    expect(parsed.content).toBe("Let me read that...");
    expect(parsed.toolCalls).toEqual([tc]);
  });

  it("handles empty content string as no-content", () => {
    const resp: ChatResponse = {
      id: "4",
      content: "",
      toolCalls: [],
      finishReason: "stop",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toBe("");
  });

  it("handles whitespace-only content as no-content", () => {
    const resp: ChatResponse = {
      id: "5",
      content: "   ",
      toolCalls: [],
      finishReason: "stop",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toBe("   ");
  });

  it("handles content as undefined (behaves like null)", () => {
    const resp: ChatResponse = {
      id: "6",
      content: undefined as unknown as string,
      toolCalls: [],
      finishReason: "stop",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("text");
    expect(parsed.content).toBe("");
  });

  it("handles multiple tool calls", () => {
    const tcs: ToolCallRequest[] = [
      { id: "c1", type: "function", function: { name: "t1", arguments: "{}" } },
      { id: "c2", type: "function", function: { name: "t2", arguments: '{"x":1}' } },
    ];
    const resp: ChatResponse = {
      id: "7",
      content: null,
      toolCalls: tcs,
      finishReason: "tool_calls",
    };
    const parsed = parseResponse(resp);
    expect(parsed.type).toBe("tool_calls");
    expect(parsed.toolCalls).toHaveLength(2);
  });

  it("handles unicode content", () => {
    const resp: ChatResponse = {
      id: "8",
      content: "こんにちは世界",
      toolCalls: [],
      finishReason: "stop",
    };
    const parsed = parseResponse(resp);
    expect(parsed.content).toBe("こんにちは世界");
  });
});

describe("buildToolResultMessage", () => {
  it("builds correct LLM tool result message", () => {
    const tc: ToolCallRequest = {
      id: "call_abc",
      type: "function",
      function: { name: "get_selection", arguments: "{}" },
    };
    const msg = buildToolResultMessage(tc, '{"text":"hello"}');
    expect(msg.role).toBe("tool");
    expect(msg.content).toBe('{"text":"hello"}');
    expect(msg.tool_call_id).toBe("call_abc");
    expect(msg.name).toBe("get_selection");
  });

  it("handles empty result string", () => {
    const tc: ToolCallRequest = {
      id: "call_empty",
      type: "function",
      function: { name: "test", arguments: "{}" },
    };
    const msg = buildToolResultMessage(tc, "");
    expect(msg.content).toBe("");
  });

  it("handles JSON error string from tool", () => {
    const tc: ToolCallRequest = {
      id: "call_err",
      type: "function",
      function: { name: "broken_tool", arguments: "{}" },
    };
    const msg = buildToolResultMessage(tc, '{"error":"Tool failed"}');
    expect(msg.content).toBe('{"error":"Tool failed"}');
  });
});
