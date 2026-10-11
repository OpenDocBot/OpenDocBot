import { describe, it, expect, beforeEach } from "vitest";
import { useMcpStore } from "../../store/mcpStore";
import { createMcpServer } from "../../mcp/types";
import type { McpServerConfig } from "../../mcp/types";

const server = (id: string, name = id): McpServerConfig => ({
  id,
  name,
  url: `https://${id}.example/mcp`,
  transport: "streamable-http",
  auth: { type: "none" },
});

beforeEach(() => {
  useMcpStore.setState({ servers: [] });
});

describe("mcpStore", () => {
  it("adds a server", () => {
    useMcpStore.getState().addServer(server("a"));
    expect(useMcpStore.getState().servers).toHaveLength(1);
  });

  it("updates a server", () => {
    useMcpStore.getState().addServer(server("a", "Old"));
    useMcpStore.getState().updateServer("a", { name: "New" });
    expect(useMcpStore.getState().servers[0].name).toBe("New");
  });

  it("removes a server", () => {
    useMcpStore.getState().addServer(server("a"));
    useMcpStore.getState().addServer(server("b"));
    useMcpStore.getState().removeServer("a");
    expect(useMcpStore.getState().servers.map((s) => s.id)).toEqual(["b"]);
  });

  it("importServers matches by URL and keeps the existing id", () => {
    useMcpStore.getState().addServer(server("a", "Old"));
    useMcpStore.getState().importServers([{ ...server("a"), name: "New" }, server("c")]);
    const byId = Object.fromEntries(useMcpStore.getState().servers.map((s) => [s.id, s.name]));
    expect(byId).toEqual({ a: "New", c: "c" });
  });

  it("importServers keeps the existing API-key secret when the import has none", () => {
    useMcpStore.getState().addServer({
      ...server("a"),
      auth: { type: "apiKey", header: "Authorization", value: "secret" },
    });
    useMcpStore.getState().importServers([
      { ...server("a"), auth: { type: "apiKey", header: "Authorization", value: "" } },
    ]);
    const auth = useMcpStore.getState().servers[0].auth;
    expect(auth).toEqual({ type: "apiKey", header: "Authorization", value: "secret" });
  });

  it("createMcpServer builds a config with an id", () => {
    const cfg = createMcpServer("GitHub", "https://api.githubcopilot.com/mcp");
    expect(cfg.id).toBeTruthy();
    expect(cfg.transport).toBe("streamable-http");
    expect(cfg.auth).toEqual({ type: "none" });
  });
});
