import { getStoredSid } from "./auth";

/**
 * Header that carries the SSO session id on same-origin `/proxy/` requests.
 * Provider requests already use `Authorization` for the provider's own API key,
 * so the session cannot share that header. The self-hosted server reads it in
 * `scripts/auth.mjs` (`bearerToken`) to gate the proxy on SSO instances.
 */
export const SESSION_HEADER = "X-Opendocbot-Session";

/**
 * Session headers for a request URL, or an empty object when the URL is not a
 * `/proxy/` request (direct provider calls need no session).
 */
export function sessionAuthHeaders(url: string): Record<string, string> {
  if (!url.startsWith("/proxy/")) return {};
  const sid = getStoredSid();
  return sid ? { [SESSION_HEADER]: sid } : {};
}

/**
 * `fetch` wrapper that authenticates `/proxy/` requests on SSO instances.
 * Non-proxy URLs are passed through untouched, so plain provider calls are
 * unaffected. Use this for every provider request that may be proxied.
 */
export function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const extra = sessionAuthHeaders(url);
  if (Object.keys(extra).length === 0) return fetch(input, init);

  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return fetch(input, { ...init, headers });
}
