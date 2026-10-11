/**
 * Model Context Protocol (MCP) integration types. OpenDocBot is a browser-only
 * MCP client: it connects to remote servers over Streamable HTTP, exposes their
 * tools to the agent loop, and loads tools on demand. stdio is not supported.
 */

export type McpTransport = "streamable-http";

export type McpAuth =
  | { type: "none" }
  /** Static credential sent on every request (e.g. Authorization: Bearer …). */
  | { type: "apiKey"; header: string; value: string }
  /** OAuth 2.1. `clientId`/`clientSecret` are optional (blank → dynamic registration). */
  | { type: "oauth"; clientId?: string; clientSecret?: string };

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: McpTransport;
  auth: McpAuth;
}

/** A tool descriptor as returned by `tools/list`. */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * A tool-result content block. MCP defines several types (`text`, `image`,
 * `audio`, `resource_link`, and embedded `resource`); servers may return any
 * mix of them, so we keep all the fields we might need to render.
 */
export interface McpContentBlock {
  type: string;
  text?: string;
  /** Base64 data for `image`/`audio` blocks. */
  data?: string;
  mimeType?: string;
  /** `resource_link` fields. */
  uri?: string;
  name?: string;
  description?: string;
  /** Embedded `resource` contents. */
  resource?: { uri?: string; mimeType?: string; text?: string; blob?: string };
  [key: string]: unknown;
}

/** Result of `tools/call`. */
export interface McpCallResult {
  content?: McpContentBlock[];
  /** Machine-readable result data (may accompany or replace text content). */
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export function createMcpServer(
  name: string,
  url: string,
  auth: McpAuth = { type: "none" },
): McpServerConfig {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    url: url.trim(),
    transport: "streamable-http",
    auth,
  };
}
