import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAccessToken } from "../../../mcp/oauth/session";
import { useMcpTokenStore } from "../../../mcp/oauth/tokenStore";

beforeEach(() => {
  useMcpTokenStore.setState({ tokens: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAccessToken", () => {
  it("returns a valid token", async () => {
    useMcpTokenStore.getState().setToken("s1", {
      accessToken: "AT",
      expiresAt: Date.now() + 100_000,
      tokenEndpoint: "https://as/token",
      clientId: "c",
      resource: "r",
    });
    expect(await getAccessToken("s1")).toBe("AT");
  });

  it("throws when the server is not connected", async () => {
    await expect(getAccessToken("s1")).rejects.toThrow(/Not connected/);
  });

  it("refreshes an expired token", async () => {
    useMcpTokenStore.getState().setToken("s1", {
      accessToken: "OLD",
      refreshToken: "RT",
      expiresAt: Date.now() - 1,
      tokenEndpoint: "https://as/token",
      clientId: "c",
      resource: "r",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ access_token: "NEW", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
    expect(await getAccessToken("s1")).toBe("NEW");
    expect(useMcpTokenStore.getState().tokens.s1.accessToken).toBe("NEW");
  });
});
