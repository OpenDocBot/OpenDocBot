import type { ToolDefinition } from "../providers/types";
import type { McpToolInfo } from "./types";

/** Prefix identifying a tool that belongs to an MCP server. */
export const MCP_TOOL_PREFIX = "mcp__";

/** A safe slug for a server name, used as the middle segment of a tool name. */
export function serverPrefix(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "server";
}

/** Keep tool names within the character set function-calling APIs accept. */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
}

/** Fully-qualified model-facing tool name for a server tool. */
export function mcpToolName(prefix: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${prefix}__${sanitizeToolName(toolName)}`;
}

export function isMcpTool(name: string): boolean {
  return name.startsWith(MCP_TOOL_PREFIX);
}

/** Convert an MCP tool descriptor into the app's `ToolDefinition`. */
export function toToolDefinition(fullName: string, info: McpToolInfo): ToolDefinition {
  const schema =
    info.inputSchema && typeof info.inputSchema === "object"
      ? info.inputSchema
      : { type: "object", properties: {} };
  const description = info.description?.trim();
  return {
    name: fullName,
    description: description ? `[MCP] ${description}` : `[MCP] ${info.name}`,
    parameters: schema,
    host: "both",
  };
}
