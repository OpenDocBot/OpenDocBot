import type { McpAuth, McpServerConfig } from "./types";

export const MCP_SERVERS_FILE_NAME = "opendocbot-mcp-servers.json";
export const MCP_SERVERS_CREDENTIALS_FILE_NAME = "opendocbot-mcp-servers-with-credentials.json";
export const MCP_SERVERS_FORMAT = "opendocbot-mcp-servers";
export const MCP_SERVERS_FORMAT_VERSION = 1;

export const MCP_CREDENTIALS_WARNING =
  "This file contains credentials (API keys and/or client secrets) in plain text. " +
  "Anyone with this file can access these MCP servers. Store it securely and delete it when no longer needed.";

interface ExportedAuth {
  type: string;
  header?: string;
  clientId?: string;
  clientSecret?: string;
  value?: string;
}

interface McpServersBundle {
  format: typeof MCP_SERVERS_FORMAT;
  version: number;
  credentialsIncluded?: boolean;
  warning?: string;
  servers: Array<{ name: string; url: string; auth: ExportedAuth }>;
}

export interface ExportMcpServersOptions {
  /**
   * Include static secrets (the API-key value and the OAuth client secret).
   * OAuth access/refresh tokens are never exported: they are scoped to the
   * authorizing user and the dynamically registered client, so they are not
   * portable and would leak account access.
   */
  includeCredentials?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exportAuth(auth: McpAuth, includeCredentials: boolean): ExportedAuth {
  if (auth.type === "apiKey") {
    return {
      type: "apiKey",
      header: auth.header,
      ...(includeCredentials && auth.value ? { value: auth.value } : {}),
    };
  }
  if (auth.type === "oauth") {
    return {
      type: "oauth",
      ...(auth.clientId ? { clientId: auth.clientId } : {}),
      ...(includeCredentials && auth.clientSecret ? { clientSecret: auth.clientSecret } : {}),
    };
  }
  return { type: auth.type };
}

/**
 * Serialize MCP servers for export. By default secrets are omitted (the user
 * re-enters them after importing); pass `includeCredentials` to include the
 * static API-key value and OAuth client secret.
 */
export function exportMcpServersJson(
  servers: McpServerConfig[],
  options: ExportMcpServersOptions = {},
): string {
  const includeCredentials = options.includeCredentials ?? false;
  const bundle: McpServersBundle = {
    format: MCP_SERVERS_FORMAT,
    version: MCP_SERVERS_FORMAT_VERSION,
    ...(includeCredentials
      ? { credentialsIncluded: true, warning: MCP_CREDENTIALS_WARNING }
      : {}),
    servers: servers.map((server) => ({
      name: server.name,
      url: server.url,
      auth: exportAuth(server.auth, includeCredentials),
    })),
  };
  return JSON.stringify(bundle, null, 2);
}

function normalizeAuth(raw: unknown): McpAuth {
  if (isPlainObject(raw)) {
    if (raw.type === "apiKey") {
      const header =
        typeof raw.header === "string" && raw.header.trim() ? raw.header.trim() : "Authorization";
      const value = typeof raw.value === "string" ? raw.value : "";
      return { type: "apiKey", header, value };
    }
    if (raw.type === "oauth") {
      const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
      const clientSecret =
        typeof raw.clientSecret === "string" && raw.clientSecret ? raw.clientSecret : undefined;
      return {
        type: "oauth",
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      };
    }
  }
  return { type: "none" };
}

/**
 * Parse an exported MCP servers bundle (the object from `exportMcpServersJson`,
 * or a bare array). Malformed entries are dropped. Throws when the payload is
 * not a recognizable bundle.
 */
export function parseMcpServersImport(text: string): McpServerConfig[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a valid MCP servers file.");
  }
  const list = Array.isArray(raw)
    ? raw
    : isPlainObject(raw) && raw.format === MCP_SERVERS_FORMAT && Array.isArray(raw.servers)
      ? raw.servers
      : null;
  if (!list) throw new Error("Not a valid MCP servers file.");

  const out: McpServerConfig[] = [];
  for (const entry of list) {
    if (!isPlainObject(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!name || !/^https?:\/\//i.test(url)) continue;
    out.push({
      id: crypto.randomUUID(),
      name,
      url,
      transport: "streamable-http",
      auth: normalizeAuth(entry.auth),
    });
  }
  return out;
}

export function parseMcpServersFile(file: File): Promise<McpServerConfig[]> {
  return file.text().then(parseMcpServersImport);
}
