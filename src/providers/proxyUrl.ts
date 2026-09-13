/**
 * Build the final request URL for a provider call.
 *
 * When `proxy` is true, the request is routed through a same-origin
 * `/proxy/<encoded-baseUrl>/<path>` endpoint so the serving process can forward
 * it server-to-server (no CORS). Otherwise the provider is called directly.
 */
export function buildRequestUrl(
  baseUrl: string,
  path: string,
  proxy?: boolean
): string {
  const clean = baseUrl.replace(/\/+$/, "");
  if (proxy) {
    return `/proxy/${encodeURIComponent(clean)}${path}`;
  }
  return `${clean}${path}`;
}
