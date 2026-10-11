import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  resource: string;
  scopes?: string;
}

interface TokenState {
  /** Tokens keyed by MCP server id. */
  tokens: Record<string, OAuthToken>;
  setToken: (serverId: string, token: OAuthToken) => void;
  clearToken: (serverId: string) => void;
}

/**
 * OAuth tokens for MCP servers. Kept in a separate persisted store (localStorage)
 * so they are never included in the servers export or the encrypted config
 * transfer. Public-client tokens in a browser are XSS-exposed; this is the same
 * trade-off as the provider API keys.
 */
export const useMcpTokenStore = create<TokenState>()(
  persist(
    (set) => ({
      tokens: {},
      setToken: (serverId, token) =>
        set((s) => ({ tokens: { ...s.tokens, [serverId]: token } })),
      clearToken: (serverId) =>
        set((s) => {
          const next = { ...s.tokens };
          delete next[serverId];
          return { tokens: next };
        }),
    }),
    {
      name: "opendocbot-mcp-tokens",
      version: 1,
      partialize: (state) => ({ tokens: state.tokens }),
    },
  ),
);

/** Whether a token is missing or within `skewMs` of expiring. */
export function isTokenExpired(token: OAuthToken, skewMs = 60_000): boolean {
  return Date.now() >= token.expiresAt - skewMs;
}
