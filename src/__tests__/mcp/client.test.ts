import { describe, it, expect, vi, afterEach } from "vitest";
import { McpClient } from "../../mcp/client";

function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("McpClient", () => {
  it("initializes, lists tools and calls a tool", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }, {
          "mcp-session-id": "sess-1",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(json({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "echo" }] } }))
      .mockResolvedValueOnce(
        json({
          jsonrpc: "2.0",
          id: 3,
          result: { content: [{ type: "text", text: "hi" }] },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new McpClient("https://mcp.example/mcp", { type: "none" });
    await client.initialize();
    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
    const result = await client.callTool("echo", { msg: "hi" });
    expect(result.content?.[0].text).toBe("hi");

    const callHeaders = fetchMock.mock.calls[3][1].headers;
    expect(callHeaders["Mcp-Session-Id"]).toBe("sess-1");
    expect(callHeaders["MCP-Protocol-Version"]).toBe("2025-06-18");
    expect(callHeaders.Accept).toContain("text/event-stream");
  });

  it("sends API key auth headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ jsonrpc: "2.0", id: 1, result: {} }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new McpClient("https://mcp.example/mcp", {
      type: "apiKey",
      header: "Authorization",
      value: "Bearer secret",
    });
    await client.initialize();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  });

  it("reads a JSON-RPC response from an SSE stream", async () => {
    const payload = `event: message\ndata: ${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2026-07-28" },
    })}\n\n`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse(payload))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new McpClient("https://mcp.example/mcp", { type: "none" });
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    const client = new McpClient("https://mcp.example/mcp", { type: "none" });
    await expect(client.initialize()).rejects.toThrow(/401/);
  });

  it("throws on a JSON-RPC error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ jsonrpc: "2.0", id: 1, result: {} }))
        .mockResolvedValueOnce(new Response(null, { status: 202 }))
        .mockResolvedValueOnce(
          json({ jsonrpc: "2.0", id: 2, error: { code: -32601, message: "no tools" } }),
        ),
    );
    const client = new McpClient("https://mcp.example/mcp", { type: "none" });
    await client.initialize();
    await expect(client.listTools()).rejects.toThrow("no tools");
  });
});
