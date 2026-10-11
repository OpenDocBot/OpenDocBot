import { describe, it, expect, vi } from "vitest";
import { buildAuthorizationUrl, parseRedirect, runOAuthFlow } from "../../../mcp/oauth/flow";

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

const asFetch = (fn: (url: string, init?: RequestInit) => Promise<Response>) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => fn(String(input), init)) as unknown as typeof fetch;

describe("flow", () => {
  it("builds an authorization URL with PKCE params", () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: "https://as.example/authorize",
        clientId: "c",
        redirectUri: "https://app.example/auth/mcp.html",
        challenge: "ch",
        state: "st",
        resource: "https://mcp.example/mcp",
        scopes: ["a", "b"],
      }),
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("scope")).toBe("a b");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example/mcp");
  });

  it("parses the redirect", () => {
    expect(parseRedirect("https://app.example/cb?code=xyz&state=st")).toEqual({
      code: "xyz",
      state: "st",
    });
    expect(() => parseRedirect("https://app.example/cb?error=denied")).toThrow(/denied/);
  });

  it("runs the full flow (discovery → dialog → exchange)", async () => {
    const fetchImpl = asFetch((url) => {
      if (url.includes("oauth-protected-resource")) {
        return json({ authorization_servers: ["https://as.example"], resource: "https://mcp.example/mcp" });
      }
      if (url.includes("oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://as.example/authorize",
          token_endpoint: "https://as.example/token",
          registration_endpoint: "https://as.example/register",
        });
      }
      if (url.endsWith("/register")) return json({ client_id: "dyn" }, 201);
      if (url.endsWith("/token")) {
        return json({ access_token: "AT", refresh_token: "RT", expires_in: 3600 });
      }
      return json({}, 404);
    });

    const openDialog = vi.fn(async (authUrl: string) => {
      const state = new URL(authUrl).searchParams.get("state");
      return `https://app.example/auth/mcp.html?code=CODE&state=${state}`;
    });

    const token = await runOAuthFlow("https://mcp.example/mcp", {
      fetchImpl,
      openDialog,
      redirectUri: "https://app.example/auth/mcp.html",
    });

    expect(token.accessToken).toBe("AT");
    expect(token.refreshToken).toBe("RT");
    expect(token.clientId).toBe("dyn");
    expect(token.resource).toBe("https://mcp.example/mcp");

    const tokenCall = vi
      .mocked(fetchImpl)
      .mock.calls.find((c) => String(c[0]).endsWith("/token"));
    const body = String((tokenCall?.[1] as RequestInit | undefined)?.body);
    expect(body).toContain("code_verifier=");
    expect(body).toContain("resource=");
    expect(body).toContain("grant_type=authorization_code");
  });

  it("rejects on a state mismatch", async () => {
    const fetchImpl = asFetch((url) => {
      if (url.includes("oauth-protected-resource")) return json({}, 404);
      if (url.includes("oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://as.example/authorize",
          token_endpoint: "https://as.example/token",
        });
      }
      return json({}, 404);
    });
    const openDialog = vi.fn(async () => "https://app.example/cb?code=C&state=WRONG");
    await expect(
      runOAuthFlow("https://mcp.example/mcp", {
        fetchImpl,
        openDialog,
        clientId: "static",
        redirectUri: "https://app.example/cb",
      }),
    ).rejects.toThrow(/state mismatch/);
  });
});
