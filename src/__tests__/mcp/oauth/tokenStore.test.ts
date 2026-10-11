import { describe, it, expect, beforeEach } from "vitest";
import { isTokenExpired, useMcpTokenStore, type OAuthToken } from "../../../mcp/oauth/tokenStore";

const token = (overrides: Partial<OAuthToken> = {}): OAuthToken => ({
  accessToken: "a",
  expiresAt: Date.now() + 100_000,
  tokenEndpoint: "https://as/token",
  clientId: "c",
  resource: "https://mcp",
  ...overrides,
});

beforeEach(() => {
  useMcpTokenStore.setState({ tokens: {} });
});

describe("tokenStore", () => {
  it("stores and clears tokens by server id", () => {
    useMcpTokenStore.getState().setToken("s1", token());
    expect(useMcpTokenStore.getState().tokens.s1.accessToken).toBe("a");
    useMcpTokenStore.getState().clearToken("s1");
    expect(useMcpTokenStore.getState().tokens.s1).toBeUndefined();
  });

  it("isTokenExpired honours the skew", () => {
    expect(isTokenExpired(token({ expiresAt: Date.now() + 100_000 }))).toBe(false);
    expect(isTokenExpired(token({ expiresAt: Date.now() + 10_000 }))).toBe(true);
    expect(isTokenExpired(token({ expiresAt: Date.now() - 1 }))).toBe(true);
  });
});
