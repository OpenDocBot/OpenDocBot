import { describe, it, expect } from "vitest";
import { WRITE_TOOLS, selectToolsForMode } from "../../chat/writeTools";
import type { ToolDefinition } from "../../providers/types";

function tool(name: string, extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {} },
    ...extra,
  };
}

const defs: ToolDefinition[] = [
  tool("read_range", { host: "excel" }),
  tool("write_range", { host: "excel" }),
  tool("execute_office_js", { host: "both" }),
  tool("add_suggestion", { host: "both", suggestionOnly: true }),
  tool("update_todos", { host: "both" }),
];

describe("selectToolsForMode", () => {
  it("keeps write tools and hides suggestion-only tools when off", () => {
    const names = selectToolsForMode(defs, false).map((t) => t.name);
    expect(names).toContain("read_range");
    expect(names).toContain("write_range");
    expect(names).toContain("execute_office_js");
    expect(names).toContain("update_todos");
    expect(names).not.toContain("add_suggestion");
  });

  it("drops write tools and exposes suggestion-only tools when on", () => {
    const names = selectToolsForMode(defs, true).map((t) => t.name);
    expect(names).toContain("read_range");
    expect(names).toContain("add_suggestion");
    expect(names).toContain("update_todos");
    expect(names).not.toContain("write_range");
    expect(names).not.toContain("execute_office_js");
  });

  it("WRITE_TOOLS includes the escape hatch", () => {
    expect(WRITE_TOOLS.has("execute_office_js")).toBe(true);
  });
});
