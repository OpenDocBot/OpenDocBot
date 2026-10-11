import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callMcpTool,
  getToolsForServers,
  resetMcpConnections,
  testServerConnection,
} from "../../mcp/manager";
import { useMcpStore } from "../../store/mcpStore";
import { createMcpServer } from "../../mcp/types";

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function ack(): Response {
  return new Response(null, { status: 202 });
}

beforeEach(() => {
  resetMcpConnections();
  useMcpStore.setState({ servers: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mcp manager", () => {
  it("connects, namespaces tools and routes calls", async () => {
    const cfg = createMcpServer("GitHub", "https://mcp.example/mcp");
    useMcpStore.setState({ servers: [cfg] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRpc(1, { protocolVersion: "2025-06-18" }))
      .mockResolvedValueOnce(ack())
      .mockResolvedValueOnce(
        jsonRpc(2, {
          tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object", properties: {} } }],
        }),
      )
      .mockResolvedValueOnce(jsonRpc(3, { content: [{ type: "text", text: "pong" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const tools = await getToolsForServers([cfg.id]);
    expect(tools.map((t) => t.name)).toEqual(["mcp__github__echo"]);

    const out = JSON.parse(await callMcpTool("mcp__github__echo", { msg: "hi" }));
    expect(out).toEqual({ content: "pong" });

    const callBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(callBody.params).toEqual({ name: "echo", arguments: { msg: "hi" } });
  });

  it("returns an error for an unknown tool", async () => {
    const out = JSON.parse(await callMcpTool("mcp__nope__x", {}));
    expect(out.error).toContain("Unknown MCP tool");
  });

  it("formats an MCP error result as { error }", async () => {
    const cfg = createMcpServer("S", "https://mcp.example/mcp");
    useMcpStore.setState({ servers: [cfg] });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonRpc(1, {}))
        .mockResolvedValueOnce(ack())
        .mockResolvedValueOnce(jsonRpc(2, { tools: [{ name: "boom" }] }))
        .mockResolvedValueOnce(
          jsonRpc(3, { isError: true, content: [{ type: "text", text: "kaboom" }] }),
        ),
    );
    await getToolsForServers([cfg.id]);
    const out = JSON.parse(await callMcpTool("mcp__s__boom", {}));
    expect(out.error).toBe("kaboom");
  });

  it("skips servers that fail to connect", async () => {
    const cfg = createMcpServer("Bad", "https://bad.example/mcp");
    useMcpStore.setState({ servers: [cfg] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    expect(await getToolsForServers([cfg.id])).toEqual([]);
  });

  it("testServerConnection reports the tool count", async () => {
    const cfg = createMcpServer("T", "https://mcp.example/mcp");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonRpc(1, {}))
        .mockResolvedValueOnce(ack())
        .mockResolvedValueOnce(jsonRpc(2, { tools: [{ name: "a" }, { name: "b" }] })),
    );
    expect(await testServerConnection(cfg)).toEqual({ ok: true, toolCount: 2 });
  });

  it("testServerConnection reports errors without throwing", async () => {
    const cfg = createMcpServer("T", "https://mcp.example/mcp");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    const result = await testServerConnection(cfg);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });
});

describe("mcp tool result formatting", () => {
  function callWithResult(result: unknown): Promise<string> {
    const cfg = createMcpServer("S", "https://mcp.example/mcp");
    useMcpStore.setState({ servers: [cfg] });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonRpc(1, {}))
        .mockResolvedValueOnce(ack())
        .mockResolvedValueOnce(jsonRpc(2, { tools: [{ name: "read" }] }))
        .mockResolvedValueOnce(jsonRpc(3, result)),
    );
    return getToolsForServers([cfg.id]).then(() => callMcpTool("mcp__s__read", {}));
  }

  it("extracts the body of an embedded resource block", async () => {
    const out = JSON.parse(
      await callWithResult({
        content: [
          { type: "resource", resource: { uri: "file:///README.md", mimeType: "text/markdown", text: "# Hello" } },
        ],
      }),
    );
    expect(out.content).toBe("# Hello");
  });

  it("describes a resource_link block", async () => {
    const out = JSON.parse(
      await callWithResult({
        content: [{ type: "resource_link", uri: "file:///a.rs", name: "a.rs" }],
      }),
    );
    expect(out.content).toContain("a.rs");
    expect(out.content).toContain("file:///a.rs");
  });

  it("combines text and resource blocks", async () => {
    const out = JSON.parse(
      await callWithResult({
        content: [
          { type: "text", text: "Summary" },
          { type: "resource", resource: { uri: "file:///x", text: "BODY" } },
        ],
      }),
    );
    expect(out.content).toContain("Summary");
    expect(out.content).toContain("BODY");
  });

  it("falls back to structuredContent when there is no text", async () => {
    const out = JSON.parse(
      await callWithResult({ structuredContent: { name: "mug", price: 24 }, content: [] }),
    );
    expect(JSON.parse(out.content)).toEqual({ name: "mug", price: 24 });
  });

  it("reports an error result that carries a resource", async () => {
    const out = JSON.parse(
      await callWithResult({
        isError: true,
        content: [{ type: "resource", resource: { uri: "file:///e", text: "boom" } }],
      }),
    );
    expect(out.error).toBe("boom");
  });
});
