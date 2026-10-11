import type { ToolDefinition } from "../providers/types";
import { useMcpStore } from "../store/mcpStore";
import { debugLog } from "../lib/debugLog";
import { McpClient } from "./client";
import { getAccessToken } from "./oauth/session";
import { mcpToolName, serverPrefix, toToolDefinition } from "./toolBridge";
import type { McpAuth, McpCallResult, McpServerConfig, McpToolInfo } from "./types";

interface Connection {
  url: string;
  authKey: string;
  client: McpClient;
  tools: McpToolInfo[];
  status: "idle" | "connecting" | "ready" | "error";
  error?: string;
  promise: Promise<void> | null;
}

const connections = new Map<string, Connection>();
/** full tool name → the server + server-side tool it maps to. */
const routes = new Map<string, { serverId: string; toolName: string }>();

function authKey(auth: McpAuth): string {
  return JSON.stringify(auth);
}

/** Drop all connections/routes (e.g. after removing or editing a server). */
export function resetMcpConnections(): void {
  connections.clear();
  routes.clear();
}

/** Drop one server's cached connection and its tool routes. */
export function resetConnection(serverId: string): void {
  connections.delete(serverId);
  for (const [name, route] of routes) {
    if (route.serverId === serverId) routes.delete(name);
  }
}

export interface ConnectionTestResult {
  ok: boolean;
  toolCount?: number;
  error?: string;
}

/**
 * Force a fresh connection to a server and report whether it worked and how
 * many tools it exposes. Never throws.
 */
export async function testServerConnection(
  config: McpServerConfig,
): Promise<ConnectionTestResult> {
  resetConnection(config.id);
  try {
    const conn = await ensureConnected(config);
    return { ok: true, toolCount: conn.tools.length };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

async function ensureConnected(config: McpServerConfig): Promise<Connection> {
  const key = authKey(config.auth);
  let conn = connections.get(config.id);
  if (!conn || conn.url !== config.url || conn.authKey !== key) {
    const tokenProvider =
      config.auth.type === "oauth" ? () => getAccessToken(config.id) : undefined;
    conn = {
      url: config.url,
      authKey: key,
      client: new McpClient(config.url, config.auth, tokenProvider),
      tools: [],
      status: "idle",
      promise: null,
    };
    connections.set(config.id, conn);
  }
  if (conn.status === "ready") return conn;

  if (!conn.promise) {
    const active = conn;
    active.status = "connecting";
    active.error = undefined;
    active.promise = (async () => {
      await active.client.initialize();
      active.tools = await active.client.listTools();
      active.status = "ready";
    })()
      .catch((err: unknown) => {
        active.status = "error";
        active.error = friendlyError(err);
        throw err;
      })
      .finally(() => {
        active.promise = null;
      });
  }
  await conn.promise;
  return conn;
}

function uniquePrefix(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Connect to the given servers (if needed) and return their tools as
 * `ToolDefinition`s, namespaced as `mcp__<server>__<tool>`. Servers that fail
 * to connect are skipped (their error is logged).
 */
export async function getToolsForServers(serverIds: string[]): Promise<ToolDefinition[]> {
  const servers = useMcpStore.getState().servers.filter((s) => serverIds.includes(s.id));
  const defs: ToolDefinition[] = [];
  const usedPrefixes = new Set<string>();

  for (const config of servers) {
    let conn: Connection;
    try {
      conn = await ensureConnected(config);
    } catch (err) {
      debugLog("warn", `MCP "${config.name}": ${friendlyError(err)}`);
      continue;
    }
    if (conn.status !== "ready") continue;

    const prefix = uniquePrefix(serverPrefix(config.name), usedPrefixes);
    usedPrefixes.add(prefix);
    for (const tool of conn.tools) {
      const fullName = mcpToolName(prefix, tool.name);
      routes.set(fullName, { serverId: config.id, toolName: tool.name });
      defs.push(toToolDefinition(fullName, tool));
    }
  }
  return defs;
}

/** Execute a namespaced MCP tool call, returning a JSON string (app convention). */
export async function callMcpTool(
  fullName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const route = routes.get(fullName);
  if (!route) return JSON.stringify({ error: `Unknown MCP tool: ${fullName}` });

  const config = useMcpStore.getState().servers.find((s) => s.id === route.serverId);
  if (!config) return JSON.stringify({ error: `MCP server not configured for ${fullName}` });

  try {
    const conn = await ensureConnected(config);
    const result = await conn.client.callTool(route.toolName, args);
    return formatResult(result);
  } catch (err) {
    return JSON.stringify({ error: friendlyError(err) });
  }
}

function formatResult(result: McpCallResult): string {
  const parts: string[] = [];
  for (const block of result.content ?? []) {
    switch (block.type) {
      case "text":
        if (typeof block.text === "string") parts.push(block.text);
        break;
      case "resource": {
        // Embedded resource: use its text; for binary blobs just describe it.
        const res = block.resource;
        if (res?.text) parts.push(res.text);
        else if (res) {
          const meta = [res.mimeType, res.blob ? "binary" : ""].filter(Boolean).join(", ");
          parts.push(`[resource ${res.uri ?? ""}${meta ? ` (${meta})` : ""}]`);
        }
        break;
      }
      case "resource_link":
        parts.push(
          `[resource ${block.name || block.uri || "link"}${block.uri ? ` (${block.uri})` : ""}]`,
        );
        break;
      case "image":
        parts.push(`[image${block.mimeType ? ` ${block.mimeType}` : ""}]`);
        break;
      case "audio":
        parts.push(`[audio${block.mimeType ? ` ${block.mimeType}` : ""}]`);
        break;
      default:
        break;
    }
  }

  let text = parts.join("\n").trim();
  // Some tools return only structured data with no text block.
  if (!text && result.structuredContent !== undefined) {
    text = JSON.stringify(result.structuredContent);
  }

  if (result.isError) {
    return JSON.stringify({ error: text || "MCP tool reported an error" });
  }
  return JSON.stringify({ content: text || "(no output)" });
}

function friendlyError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Could not reach the MCP server (network error or blocked by CORS).";
  }
  return err instanceof Error ? err.message : String(err);
}
