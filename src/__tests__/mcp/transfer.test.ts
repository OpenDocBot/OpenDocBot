import { describe, it, expect } from "vitest";
import {
  exportMcpServersJson,
  parseMcpServersImport,
  MCP_SERVERS_FORMAT,
} from "../../mcp/transfer";
import type { McpServerConfig } from "../../mcp/types";

const alpha: McpServerConfig = {
  id: "a",
  name: "Alpha",
  url: "https://a.example/mcp",
  transport: "streamable-http",
  auth: { type: "none" },
};

describe("MCP servers transfer", () => {
  it("exports without secrets", () => {
    const cfg: McpServerConfig = {
      ...alpha,
      auth: { type: "apiKey", header: "X-Key", value: "supersecret" },
    };
    const json = exportMcpServersJson([cfg]);
    expect(json).not.toContain("supersecret");
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe(MCP_SERVERS_FORMAT);
    expect(parsed.servers[0].auth).toEqual({ type: "apiKey", header: "X-Key" });
  });

  it("omits credentials by default and does not flag them", () => {
    const cfg: McpServerConfig = {
      ...alpha,
      auth: { type: "apiKey", header: "X-Key", value: "supersecret" },
    };
    const json = exportMcpServersJson([cfg]);
    expect(json).not.toContain("supersecret");
    expect(JSON.parse(json).credentialsIncluded).toBeUndefined();
  });

  it("includes credentials (apiKey value + oauth client secret) when requested", () => {
    const apiKey: McpServerConfig = {
      ...alpha,
      auth: { type: "apiKey", header: "X-Key", value: "supersecret" },
    };
    const oauth: McpServerConfig = {
      id: "o",
      name: "OAuth",
      url: "https://o.example/mcp",
      transport: "streamable-http",
      auth: { type: "oauth", clientId: "cid", clientSecret: "csecret" },
    };
    const json = exportMcpServersJson([apiKey, oauth], { includeCredentials: true });
    expect(json).toContain("supersecret");
    expect(json).toContain("csecret");
    const parsed = JSON.parse(json);
    expect(parsed.credentialsIncluded).toBe(true);
    expect(typeof parsed.warning).toBe("string");
    expect(parsed.servers[0].auth.value).toBe("supersecret");
    expect(parsed.servers[1].auth.clientSecret).toBe("csecret");
  });

  it("round-trips credentials on import", () => {
    const apiKey: McpServerConfig = {
      ...alpha,
      auth: { type: "apiKey", header: "X-Key", value: "supersecret" },
    };
    const oauth: McpServerConfig = {
      id: "o",
      name: "OAuth",
      url: "https://o.example/mcp",
      transport: "streamable-http",
      auth: { type: "oauth", clientId: "cid", clientSecret: "csecret" },
    };
    const out = parseMcpServersImport(
      exportMcpServersJson([apiKey, oauth], { includeCredentials: true }),
    );
    expect(out[0].auth).toEqual({ type: "apiKey", header: "X-Key", value: "supersecret" });
    expect(out[1].auth).toEqual({ type: "oauth", clientId: "cid", clientSecret: "csecret" });
  });

  it("round-trips a no-auth server", () => {
    const out = parseMcpServersImport(exportMcpServersJson([alpha]));
    expect(out[0]).toMatchObject({ name: "Alpha", url: alpha.url, auth: { type: "none" } });
  });

  it("imports an apiKey server with an empty value", () => {
    const out = parseMcpServersImport(
      exportMcpServersJson([
        { ...alpha, auth: { type: "apiKey", header: "Authorization", value: "x" } },
      ]),
    );
    expect(out[0].auth).toEqual({ type: "apiKey", header: "Authorization", value: "" });
  });

  it("drops malformed entries and non-http URLs", () => {
    const text = JSON.stringify({
      format: MCP_SERVERS_FORMAT,
      version: 1,
      servers: [alpha, { name: "" }, { name: "X", url: "ftp://x" }, 5],
    });
    expect(parseMcpServersImport(text)).toHaveLength(1);
  });

  it("accepts a bare array", () => {
    expect(parseMcpServersImport(JSON.stringify([alpha]))).toHaveLength(1);
  });

  it("throws on an unrelated object", () => {
    expect(() => parseMcpServersImport('{"format":"other"}')).toThrow();
  });
});
