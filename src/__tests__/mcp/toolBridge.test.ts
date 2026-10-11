import { describe, it, expect } from "vitest";
import {
  MCP_TOOL_PREFIX,
  isMcpTool,
  mcpToolName,
  sanitizeToolName,
  serverPrefix,
  toToolDefinition,
} from "../../mcp/toolBridge";

describe("mcp toolBridge", () => {
  it("builds a namespaced tool name", () => {
    expect(mcpToolName("github", "create_issue")).toBe("mcp__github__create_issue");
  });

  it("prefixes with MCP_TOOL_PREFIX", () => {
    expect(mcpToolName("x", "y").startsWith(MCP_TOOL_PREFIX)).toBe(true);
  });

  it("isMcpTool detects the prefix", () => {
    expect(isMcpTool("mcp__github__create_issue")).toBe(true);
    expect(isMcpTool("edit_doc_text")).toBe(false);
  });

  it("slugifies the server name", () => {
    expect(serverPrefix("My GitHub Server!")).toBe("my-github-server");
    expect(serverPrefix("!!!")).toBe("server");
  });

  it("sanitizes tool names to the allowed character set", () => {
    expect(sanitizeToolName("do.stuff/now")).toBe("do_stuff_now");
  });

  it("converts a tool descriptor, keeping the input schema", () => {
    const def = toToolDefinition("mcp__github__echo", {
      name: "echo",
      description: "Echo back",
      inputSchema: { type: "object", properties: { msg: { type: "string" } } },
    });
    expect(def.name).toBe("mcp__github__echo");
    expect(def.description).toBe("[MCP] Echo back");
    expect(def.host).toBe("both");
    expect(def.parameters).toMatchObject({ type: "object" });
  });

  it("falls back to an empty schema when none is given", () => {
    const def = toToolDefinition("mcp__x__y", { name: "y" });
    expect(def.parameters).toEqual({ type: "object", properties: {} });
    expect(def.description).toBe("[MCP] y");
  });
});
