/**
 * OAuth 2.1 discovery for MCP servers (RFC 9728 protected-resource metadata →
 * RFC 8414 / OIDC authorization-server metadata).
 */

export interface AuthServerMetadata {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  resource: string;
  scopesSupported: string[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function protectedResourceMetadata(
  mcpUrl: string,
  fetchImpl: FetchLike,
): Promise<{ authorizationServers: string[]; resource: string } | null> {
  const url = new URL(mcpUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  const candidates = [
    `${url.origin}/.well-known/oauth-protected-resource${path}`,
    `${url.origin}/.well-known/oauth-protected-resource`,
  ];
  for (const candidate of candidates) {
    const json = await fetchJson(candidate, fetchImpl);
    if (json && Array.isArray(json.authorization_servers) && json.authorization_servers.length > 0) {
      return {
        authorizationServers: json.authorization_servers as string[],
        resource: typeof json.resource === "string" ? json.resource : mcpUrl,
      };
    }
  }
  return null;
}

async function authorizationServerMetadata(
  asUrl: string,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown> | null> {
  const url = new URL(asUrl);
  const origin = url.origin;
  // RFC 8414: for an issuer with a path component the well-known URI is inserted
  // between the host and the path (e.g. https://host/.well-known/oauth-authorization-server/issuer1).
  const path = url.pathname.replace(/\/+$/, "");
  const base = `${origin}${path}`;
  const candidates = [
    `${origin}/.well-known/oauth-authorization-server${path}`,
    `${origin}/.well-known/openid-configuration${path}`,
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];
  for (const candidate of [...new Set(candidates)]) {
    const json = await fetchJson(candidate, fetchImpl);
    if (json && typeof json.authorization_endpoint === "string" && typeof json.token_endpoint === "string") {
      return json;
    }
  }
  return null;
}

/**
 * Discover the authorization server for an MCP server URL. Falls back to using
 * the MCP server's own origin as the authorization server when no
 * protected-resource metadata is published.
 */
export async function discoverAuthServer(
  mcpUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<AuthServerMetadata> {
  const prm = await protectedResourceMetadata(mcpUrl, fetchImpl);
  const asUrl = prm?.authorizationServers[0] ?? new URL(mcpUrl).origin;
  const metadata = await authorizationServerMetadata(asUrl, fetchImpl);
  if (!metadata) {
    throw new Error("Could not discover the authorization server for this MCP server.");
  }
  return {
    authorizationEndpoint: metadata.authorization_endpoint as string,
    tokenEndpoint: metadata.token_endpoint as string,
    registrationEndpoint:
      typeof metadata.registration_endpoint === "string" ? metadata.registration_endpoint : undefined,
    resource: prm?.resource ?? mcpUrl,
    scopesSupported: Array.isArray(metadata.scopes_supported)
      ? (metadata.scopes_supported as string[])
      : [],
  };
}
