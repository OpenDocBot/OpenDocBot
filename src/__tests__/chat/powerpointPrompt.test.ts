import { describe, it, expect } from "vitest";
import { buildPowerPointSystemPrompt } from "../../chat/agentLoop";
import type { ToolDefinition } from "../../providers/types";

const dummyTools: ToolDefinition[] = [
  {
    name: "list_slide_shapes",
    description: "List shapes",
    parameters: { type: "object", properties: {} },
    host: "powerpoint",
  },
  {
    name: "insert_slide_element",
    description: "Insert element",
    parameters: { type: "object", properties: {} },
    host: "powerpoint",
  },
];

describe("buildPowerPointSystemPrompt", () => {
  const prompt = buildPowerPointSystemPrompt(dummyTools);

  it("lists the available tools", () => {
    expect(prompt).toContain("list_slide_shapes");
    expect(prompt).toContain("insert_slide_element");
  });

  it("tells the model to add shapes via insert_slide_element", () => {
    expect(prompt).toContain("This is the tool to use for adding ANY shape");
  });

  it("warns that PowerPoint.js has no addShape", () => {
    expect(prompt).toContain("There is no `addShape` in PowerPoint.js");
    expect(prompt).toContain("addGeometricShape");
    expect(prompt).toContain("addTextBox");
  });

  it("warns that slide.background is unavailable and steers to a full-bleed rectangle", () => {
    expect(prompt).toContain("there is NO slide-background API");
    expect(prompt).toContain("full-bleed rectangle");
    expect(prompt).toContain("`format_shape` to fill it");
    expect(prompt).toContain("no `slide.background`");
  });

  it("documents that full-bleed shapes auto-back and PowerPoint.js has no z-order API", () => {
    expect(prompt).toContain("automatically places full-bleed shapes at the back");
    expect(prompt).toContain("no z-order API");
    expect(prompt).toContain("zOrder");
    expect(prompt).toContain("list_slide_shapes");
  });

  it("tells the model re-import changes shape ids (re-run list_slide_shapes)", () => {
    expect(prompt).toContain("Re-import changes shape ids");
    expect(prompt).toContain("re-run `list_slide_shapes`");
  });

  it("cautions that raw XML shape injection can be silently dropped", () => {
    expect(prompt).toContain("silently drop shapes injected via raw XML");
    expect(prompt).toContain("verify with `read_slide`");
  });

  it("tells the model to load properties before reading them in execute_office_js", () => {
    expect(prompt).toContain("MUST load them first");
    expect(prompt).toContain("context.sync()");
    expect(prompt).toContain('shapes.load("top,left,width,height,name")');
  });

  it("notes list_slide_shapes already returns geometry (no re-read via execute_office_js)", () => {
    expect(prompt).toContain("It also returns each shape's position/size");
    expect(prompt).toContain("do NOT re-read geometry");
  });

  it("tells the model edit_slide_xml always uses slidePath, never position-based names", () => {
    expect(prompt).toContain("slidePath");
    expect(prompt).toContain("never guess position-based names like slide2.xml");
  });
});
