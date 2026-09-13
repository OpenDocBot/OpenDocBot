import { describe, it, expect, beforeEach } from "vitest";
import { toolRegistry, executeTool, toolAppliesToHost } from "../../tools/registry";
import type { ToolDefinition } from "../../providers/types";

const dummyTool: ToolDefinition = {
  name: "dummy",
  description: "A dummy tool",
  parameters: { type: "object", properties: {} },
};

beforeEach(() => {
  // Reset tool registry is tricky since it's module-level.
  // We test with uniquely named tools to avoid conflicts.
});

describe("toolRegistry", () => {
  it("registers and retrieves tool definitions", () => {
    toolRegistry.register(dummyTool, async () => "ok");
    expect(toolRegistry.getDefinition("dummy")).toBe(dummyTool);
  });

  it("lists registered tool names", () => {
    toolRegistry.register(
      { name: "list_test_1", description: "t1", parameters: { type: "object", properties: {} } },
      async () => "ok"
    );
    expect(toolRegistry.listNames()).toContain("list_test_1");
  });

  it("returns undefined for unknown tool", () => {
    expect(toolRegistry.getDefinition("nonexistent_tool_xyz")).toBeUndefined();
    expect(toolRegistry.getExecutor("nonexistent_tool_xyz")).toBeUndefined();
  });

  it("overwrites existing tool registration", () => {
    const tool1: ToolDefinition = {
      name: "overwrite_test",
      description: "v1",
      parameters: { type: "object", properties: {} },
    };
    const tool2: ToolDefinition = {
      name: "overwrite_test",
      description: "v2",
      parameters: { type: "object", properties: {} },
    };

    toolRegistry.register(tool1, async () => "v1");
    toolRegistry.register(tool2, async () => "v2");

    expect(toolRegistry.getDefinition("overwrite_test")!.description).toBe("v2");
  });

  it("executeTool returns result from executor", async () => {
    toolRegistry.register(
      { name: "exec_test", description: "exec", parameters: { type: "object", properties: {} } },
      async (args) => JSON.stringify({ result: args.x })
    );
    const result = await executeTool("exec_test", { x: 42 });
    expect(JSON.parse(result)).toEqual({ result: 42 });
  });

  it("executeTool returns error JSON for unknown tool", async () => {
    const result = await executeTool("no_such_tool_123", {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Unknown tool");
  });

  it("executeTool catches executor errors", async () => {
    toolRegistry.register(
      { name: "broken_test", description: "broken", parameters: { type: "object", properties: {} } },
      async () => {
        throw new Error("Executor crashed");
      }
    );
    const result = await executeTool("broken_test", {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("Tool error");
  });

  it("executeTool handles synchronous executor", async () => {
    toolRegistry.register(
      { name: "sync_test", description: "sync", parameters: { type: "object", properties: {} } },
      () => "sync-result"
    );
    const result = await executeTool("sync_test", {});
    expect(result).toBe("sync-result");
  });

  it("listDefinitions returns copies of tool definitions", () => {
    toolRegistry.register(
      { name: "list_def_test", description: "test", parameters: { type: "object", properties: {} } },
      async () => "ok"
    );
    const defs = toolRegistry.listDefinitions();
    const found = defs.find((d) => d.name === "list_def_test");
    expect(found).toBeDefined();
    expect(found!.description).toBe("test");
  });

  it("listNames includes all registered tools", () => {
    const before = toolRegistry.listNames().length;
    toolRegistry.register(
      { name: "unique_tool_for_test", description: "t", parameters: { type: "object", properties: {} } },
      async () => "ok"
    );
    const after = toolRegistry.listNames().length;
    expect(after).toBeGreaterThanOrEqual(before + 1);
  });
});

describe("toolRegistry — host scoping", () => {
  const wordTool: ToolDefinition = {
    name: "host_word_tool", description: "word only", host: "word",
    parameters: { type: "object", properties: {} },
  };
  const excelTool: ToolDefinition = {
    name: "host_excel_tool", description: "excel only", host: "excel",
    parameters: { type: "object", properties: {} },
  };
  const powerpointTool: ToolDefinition = {
    name: "host_ppt_tool", description: "powerpoint only", host: "powerpoint",
    parameters: { type: "object", properties: {} },
  };
  const sharedTool: ToolDefinition = {
    name: "host_shared_tool", description: "both", host: "both",
    parameters: { type: "object", properties: {} },
  };
  const unsetTool: ToolDefinition = {
    name: "host_unset_tool", description: "no host field",
    parameters: { type: "object", properties: {} },
  };

  beforeEach(() => {
    toolRegistry.register(wordTool, async () => "ok");
    toolRegistry.register(excelTool, async () => "ok");
    toolRegistry.register(powerpointTool, async () => "ok");
    toolRegistry.register(sharedTool, async () => "ok");
    toolRegistry.register(unsetTool, async () => "ok");
  });

  it("toolAppliesToHost matches explicit hosts and defaults", () => {
    expect(toolAppliesToHost(wordTool, "word")).toBe(true);
    expect(toolAppliesToHost(wordTool, "excel")).toBe(false);
    expect(toolAppliesToHost(excelTool, "excel")).toBe(true);
    expect(toolAppliesToHost(excelTool, "word")).toBe(false);
    expect(toolAppliesToHost(powerpointTool, "powerpoint")).toBe(true);
    expect(toolAppliesToHost(powerpointTool, "word")).toBe(false);
    expect(toolAppliesToHost(powerpointTool, "excel")).toBe(false);
    expect(toolAppliesToHost(sharedTool, "word")).toBe(true);
    expect(toolAppliesToHost(sharedTool, "excel")).toBe(true);
    expect(toolAppliesToHost(sharedTool, "powerpoint")).toBe(true);
    expect(toolAppliesToHost(unsetTool, "excel")).toBe(true);
  });

  it("listDefinitionsForHost('word') excludes excel tools", () => {
    const names = toolRegistry.listDefinitionsForHost("word").map((t) => t.name);
    expect(names).toContain("host_word_tool");
    expect(names).toContain("host_shared_tool");
    expect(names).toContain("host_unset_tool");
    expect(names).not.toContain("host_excel_tool");
    expect(names).not.toContain("host_ppt_tool");
  });

  it("listDefinitionsForHost('excel') excludes word tools", () => {
    const names = toolRegistry.listDefinitionsForHost("excel").map((t) => t.name);
    expect(names).toContain("host_excel_tool");
    expect(names).toContain("host_shared_tool");
    expect(names).toContain("host_unset_tool");
    expect(names).not.toContain("host_word_tool");
    expect(names).not.toContain("host_ppt_tool");
  });

  it("listDefinitionsForHost('powerpoint') includes powerpoint tools only", () => {
    const names = toolRegistry.listDefinitionsForHost("powerpoint").map((t) => t.name);
    expect(names).toContain("host_ppt_tool");
    expect(names).toContain("host_shared_tool");
    expect(names).toContain("host_unset_tool");
    expect(names).not.toContain("host_word_tool");
    expect(names).not.toContain("host_excel_tool");
  });

  it("listNamesForHost matches listDefinitionsForHost", () => {
    expect(toolRegistry.listNamesForHost("word")).toEqual(
      toolRegistry.listDefinitionsForHost("word").map((t) => t.name)
    );
  });
});
