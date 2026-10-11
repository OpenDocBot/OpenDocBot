import { describe, it, expect, vi } from "vitest";
import { discoverAuthServer } from "../../../mcp/oauth/discovery";

function json(body: unknown, ok = true): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 404,
      headers: { "content-type": "application/json" },
    }),
  );
}

const asFetch = (fn: (url: string) => Promise<Response>) =>
  vi.fn((input: RequestInfo | URL) => fn(String(input))) as unknown as typeof fetch;

describe("discoverAuthServer", () => {
  it("uses protected-resource metadata to find the AS", async () => {
    const fetchImpl = asFetch((url) => {
      if (url.includes("oauth-protected-resource")) {
        return json({ authorization_servers: ["https://auth.example"], resource: "https://mcp.example/mcp" });
      }
      if (url.includes("oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://auth.example/authorize",
          token_endpoint: "https://auth.example/token",
          registration_endpoint: "https://auth.example/register",
        });
      }
      return json({}, false);
    });

    const meta = await discoverAuthServer("https://mcp.example/mcp", fetchImpl);
    expect(meta.authorizationEndpoint).toBe("https://auth.example/authorize");
    expect(meta.tokenEndpoint).toBe("https://auth.example/token");
    expect(meta.registrationEndpoint).toBe("https://auth.example/register");
    expect(meta.resource).toBe("https://mcp.example/mcp");
  });

  it("uses RFC 8414 path-insertion for an issuer with a path component", async () => {
    const seen: string[] = [];
    const fetchImpl = asFetch((url) => {
      seen.push(url);
      if (url.includes("oauth-protected-resource")) {
        return json({
          authorization_servers: ["https://github.com/login/oauth"],
          resource: "https://api.githubcopilot.com/mcp",
        });
      }
      if (url === "https://github.com/.well-known/oauth-authorization-server/login/oauth") {
        return json({
          authorization_endpoint: "https://github.com/login/oauth/authorize",
          token_endpoint: "https://github.com/login/oauth/access_token",
        });
      }
      return json({}, false);
    });

    const meta = await discoverAuthServer("https://api.githubcopilot.com/mcp/", fetchImpl);
    expect(meta.authorizationEndpoint).toBe("https://github.com/login/oauth/authorize");
    expect(meta.tokenEndpoint).toBe("https://github.com/login/oauth/access_token");
    expect(meta.resource).toBe("https://api.githubcopilot.com/mcp");
    expect(seen).toContain("https://github.com/.well-known/oauth-authorization-server/login/oauth");
  });

  it("falls back to the MCP origin as the AS", async () => {
    const fetchImpl = asFetch((url) => {
      if (url.includes("oauth-protected-resource")) return json({}, false);
      if (url.includes("oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://mcp.example/authorize",
          token_endpoint: "https://mcp.example/token",
        });
      }
      return json({}, false);
    });

    const meta = await discoverAuthServer("https://mcp.example/mcp", fetchImpl);
    expect(meta.authorizationEndpoint).toBe("https://mcp.example/authorize");
    expect(meta.registrationEndpoint).toBeUndefined();
  });

  it("throws when no AS metadata is found", async () => {
    const fetchImpl = asFetch(() => json({}, false));
    await expect(discoverAuthServer("https://mcp.example/mcp", fetchImpl)).rejects.toThrow(
      /discover the authorization server/,
    );
  });
});
