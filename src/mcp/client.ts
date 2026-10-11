import type { McpAuth, McpCallResult, McpToolInfo } from "./types";

/** Protocol version we advertise first; the server may negotiate a different one. */
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "opendocbot", version: "1.0.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

/**
 * Minimal MCP client over the Streamable HTTP transport. Handles the
 * `initialize` handshake, session id, protocol-version header, and both
 * JSON and SSE responses.
 */
export class McpClient {
  private sessionId: string | null = null;
  private protocolVersion = DEFAULT_PROTOCOL_VERSION;
  private nextId = 1;
  private initialized = false;

  constructor(
    private readonly url: string,
    private readonly auth: McpAuth,
    /** Resolves a fresh bearer token for OAuth servers (called per request). */
    private readonly tokenProvider?: () => Promise<string>,
  ) {}

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.auth.type === "oauth") {
      if (!this.tokenProvider) throw new Error("OAuth is not configured for this MCP server.");
      return { Authorization: `Bearer ${await this.tokenProvider()}` };
    }
    if (this.auth.type === "apiKey" && this.auth.header.trim() && this.auth.value) {
      return { [this.auth.header.trim()]: this.auth.value };
    }
    return {};
  }

  private async baseHeaders(): Promise<Record<string, string>> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(await this.authHeaders()),
    };
  }

  private sessionHeaders(): Record<string, string> {
    return {
      "MCP-Protocol-Version": this.protocolVersion,
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
    };
  }

  async initialize(): Promise<void> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    };
    const res = await this.post(req, {});
    if (!res.ok) throw new Error(await describeHttpError(res));

    const sessionId = res.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;

    const result = (await readJsonRpcResult(res, req.id)) as { protocolVersion?: string };
    if (result.protocolVersion) this.protocolVersion = result.protocolVersion;

    // Best-effort `initialized` notification (servers may return 202).
    await this.notify("notifications/initialized");
    this.initialized = true;
  }

  private async post(body: unknown, extraHeaders: Record<string, string>): Promise<Response> {
    return fetch(this.url, {
      method: "POST",
      headers: { ...(await this.baseHeaders()), ...extraHeaders },
      body: JSON.stringify(body),
    });
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const body: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) body.params = params;
    const res = await this.post(body, this.sessionHeaders());
    if (!res.ok && res.status !== 202) throw new Error(await describeHttpError(res));
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.initialized) await this.initialize();
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const res = await this.post(req, this.sessionHeaders());
    if (!res.ok) throw new Error(await describeHttpError(res));
    return readJsonRpcResult(res, id);
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.request("tools/list", {})) as { tools?: McpToolInfo[] };
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    return (await this.request("tools/call", { name, arguments: args })) as McpCallResult;
  }
}

async function describeHttpError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  const detail = text ? `: ${text.slice(0, 300)}` : "";
  if (res.status === 401) return `MCP server requires authorization (401)${detail}`;
  if (res.status === 404) return `MCP endpoint not found (404). Check the server URL.`;
  return `MCP server returned HTTP ${res.status}${detail}`;
}

/** Unwrap a JSON-RPC envelope, throwing on a protocol error. */
function unwrap(message: unknown): unknown {
  const msg = message as { error?: { message?: string; code?: number }; result?: unknown };
  if (msg?.error) {
    throw new Error(msg.error.message || `JSON-RPC error ${msg.error.code ?? ""}`.trim());
  }
  return msg?.result;
}

/** Read a JSON-RPC response from a JSON body or an SSE stream. */
async function readJsonRpcResult(res: Response, id: number): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const json = await res.json().catch(() => null);
    if (!json) throw new Error("Invalid JSON-RPC response from MCP server");
    return unwrap(json);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("MCP server returned an empty SSE stream");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const message = parseSseEvent(event);
        if (message && (message as { id?: number }).id === id) return unwrap(message);
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const last = parseSseEvent(buffer);
  if (last && (last as { id?: number }).id === id) return unwrap(last);
  throw new Error("No JSON-RPC response in MCP SSE stream");
}

function parseSseEvent(block: string): unknown {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}
