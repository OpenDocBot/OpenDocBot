import { isTokenExpired, useMcpTokenStore } from "./tokenStore";
import { refreshAccessToken } from "./flow";

/**
 * Return a valid access token for an OAuth MCP server, refreshing it when close
 * to expiry. Throws when the server has not been authorized (or the refresh
 * token is gone), so the caller can surface a "connect" prompt.
 */
export async function getAccessToken(serverId: string): Promise<string> {
  const token = useMcpTokenStore.getState().tokens[serverId];
  if (!token) throw new Error("Not connected: authorize this MCP server first.");
  if (!isTokenExpired(token)) return token.accessToken;

  const refreshed = await refreshAccessToken(token);
  if (refreshed) {
    useMcpTokenStore.getState().setToken(serverId, refreshed);
    return refreshed.accessToken;
  }
  throw new Error("Authorization expired: reconnect this MCP server.");
}
