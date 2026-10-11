import { discoverAuthServer } from "./discovery";
import { createPkcePair, createState } from "./pkce";
import { registerClient } from "./registration";
import type { OAuthToken } from "./tokenStore";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Same-origin callback page (see `public/auth/mcp.html`). */
export function defaultRedirectUri(): string {
  return `${location.origin}/auth/mcp.html`;
}

export interface AuthorizationParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  resource: string;
  scopes?: string[];
}

export function buildAuthorizationUrl(params: AuthorizationParams): string {
  const url = new URL(params.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", params.resource);
  if (params.scopes && params.scopes.length > 0) {
    url.searchParams.set("scope", params.scopes.join(" "));
  }
  return url.toString();
}

export function parseRedirect(redirect: string): { code: string; state: string } {
  const url = new URL(redirect);
  const code = url.searchParams.get("code");
  if (!code) {
    const error = url.searchParams.get("error");
    throw new Error(error ? `Authorization failed: ${error}` : "Authorization did not return a code.");
  }
  return { code, state: url.searchParams.get("state") ?? "" };
}

async function tokenRequest(
  tokenEndpoint: string,
  body: URLSearchParams,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token request failed (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function toToken(json: Record<string, unknown>): {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes?: string;
} {
  if (typeof json.access_token !== "string") throw new Error("Token response missing access_token.");
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: typeof json.scope === "string" ? json.scope : undefined,
  };
}

interface ExchangeParams {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  verifier: string;
  resource: string;
  fetchImpl: FetchLike;
}

export async function exchangeCode(params: ExchangeParams): Promise<OAuthToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
    resource: params.resource,
  });
  if (params.clientSecret) body.set("client_secret", params.clientSecret);
  const json = await tokenRequest(params.tokenEndpoint, body, params.fetchImpl);
  return {
    ...toToken(json),
    tokenEndpoint: params.tokenEndpoint,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    resource: params.resource,
  };
}

/** Refresh an access token. Returns null when there is no refresh token. */
export async function refreshAccessToken(
  token: OAuthToken,
  fetchImpl: FetchLike = fetch,
): Promise<OAuthToken | null> {
  if (!token.refreshToken) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
    client_id: token.clientId,
    resource: token.resource,
  });
  if (token.clientSecret) body.set("client_secret", token.clientSecret);
  const json = await tokenRequest(token.tokenEndpoint, body, fetchImpl);
  const next = toToken(json);
  return {
    ...token,
    accessToken: next.accessToken,
    refreshToken: next.refreshToken ?? token.refreshToken,
    expiresAt: next.expiresAt,
    scopes: next.scopes ?? token.scopes,
  };
}

export interface OAuthFlowDeps {
  /** Opens the authorization URL and resolves with the final redirect URL. */
  openDialog: (url: string) => Promise<string>;
  fetchImpl?: FetchLike;
  redirectUri?: string;
  /** Pre-registered / CIMD client id. When absent, dynamic registration is used. */
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
}

/** Run the full authorization-code + PKCE flow and return the token. */
export async function runOAuthFlow(mcpUrl: string, deps: OAuthFlowDeps): Promise<OAuthToken> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const redirectUri = deps.redirectUri ?? defaultRedirectUri();
  const meta = await discoverAuthServer(mcpUrl, fetchImpl);

  let clientId = deps.clientId?.trim() ?? "";
  let clientSecret = deps.clientSecret;
  if (!clientId) {
    if (!meta.registrationEndpoint) {
      throw new Error("This server does not support dynamic registration; provide a Client ID.");
    }
    const registered = await registerClient(meta.registrationEndpoint, redirectUri, fetchImpl);
    clientId = registered.clientId;
    clientSecret = registered.clientSecret;
  }

  const { verifier, challenge } = await createPkcePair();
  const state = createState();
  const authUrl = buildAuthorizationUrl({
    authorizationEndpoint: meta.authorizationEndpoint,
    clientId,
    redirectUri,
    challenge,
    state,
    resource: meta.resource,
    scopes: deps.scopes,
  });

  const redirect = await deps.openDialog(authUrl);
  const { code, state: returnedState } = parseRedirect(redirect);
  if (returnedState !== state) throw new Error("OAuth state mismatch (possible CSRF).");

  return exchangeCode({
    tokenEndpoint: meta.tokenEndpoint,
    code,
    redirectUri,
    clientId,
    clientSecret,
    verifier,
    resource: meta.resource,
    fetchImpl,
  });
}
