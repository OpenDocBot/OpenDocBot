import { describe, it, expect } from "vitest";
import { StreamToolParser } from "../../chat/toolCallParser";

describe("StreamToolParser", () => {
  // ===== Generic text pass-through =====
  it("passes through plain text", () => {
    const p = new StreamToolParser();
    p.feed("Hello world");
    expect(p.flushBuffer()).toBe("Hello world");
  });

  // ===== <tool_calls><tool_call name="x"> format =====
  it("parses tool_calls with name attributes", () => {
    const p = new StreamToolParser();
    p.feed('Let me check... <tool_calls> <tool_call name="get_selection">uuid</tool_call> <tool_call name="get_document_text">uuid</tool_call> </tool_calls>');
    expect(p.getCapturedTools()).toEqual(["get_selection", "get_document_text"]);
    expect(p.flushBuffer().trim()).toBe("Let me check...");
  });

  // ===== <function-calls><function-call><function-name> format =====
  it("parses function-calls with function-name tags", () => {
    const p = new StreamToolParser();
    p.feed("<function-calls><function-call><function-name>get_selection</function-name></function-call></function-calls>");
    expect(p.getCapturedTools()).toEqual(["get_selection"]);
  });

  // ===== <tools><name> format =====
  it("parses tools block with tag names", () => {
    const p = new StreamToolParser();
    p.feed("<tools> <get_selection> <get_document_text> </tools>");
    expect(p.getCapturedTools()).toEqual(["get_selection", "get_document_text"]);
  });

  // ===== <system-reminder> blocks =====
  it("strips system-reminder blocks", () => {
    const p = new StreamToolParser();
    p.feed("Hello <system-reminder>Some reminder text</system-reminder> World");
    expect(p.flushBuffer().trim()).toBe("Hello  World");
    expect(p.getCapturedTools()).toEqual([]);
  });

  // ===== Streaming =====
  it("handles chunked tool_calls", () => {
    const p = new StreamToolParser();
    p.feed('Text <tool_calls> <tool_call name="get_selec');
    p.feed('tion">uuid</tool_call> </tool_calls> More');
    expect(p.getCapturedTools()).toEqual(["get_selection"]);
    expect(p.flushBuffer()).toBe("Text  More");
  });

  // ===== Multiple blocks =====
  it("handles multiple tool blocks in one response", () => {
    const p = new StreamToolParser();
    p.feed('A <tools> <t1> </tools> B <function-calls><function-call><function-name>t2</function-name></function-call></function-calls> C');
    expect(p.getCapturedTools()).toEqual(["t1", "t2"]);
    expect(p.flushBuffer()).toBe("A  B  C");
  });

  // ===== Reset =====
  it("resets correctly", () => {
    const p = new StreamToolParser();
    p.feed('<tool_call name="t1">x</tool_call>');
    expect(p.getCapturedTools()).toEqual(["t1"]);
    p.reset();
    expect(p.getCapturedTools()).toEqual([]);
  });
});
