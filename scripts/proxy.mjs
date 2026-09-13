/**
 * Shared request-forwarding logic used by both the Vite dev server middleware
 * (vite.config.ts) and the self-hosted Node server (scripts/serve.mjs).
 *
 * The add-in's "Proxy API requests" feature rewrites provider URLs to
 * `/proxy/<encoded-baseUrl>/<path>`. This module decodes the base URL and
 * forwards the request server-to-server, where CORS does not apply.
 */

import http from "node:http";
import https from "node:https";

const PROXY_PREFIX = "/proxy/";

/** Decode `/proxy/<encoded-baseUrl>/<path>` into `{ baseUrl, path }`. */
export function parseProxyTarget(url) {
  const rest = url.slice(PROXY_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash === -1) {
    return { baseUrl: null, path: "" };
  }
  const encoded = rest.slice(0, slash);
  let baseUrl;
  try {
    baseUrl = decodeURIComponent(encoded);
  } catch {
    baseUrl = null;
  }
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return { baseUrl: null, path: "" };
  }
  return { baseUrl, path: rest.slice(slash) };
}

/** Pipe one HTTP(S) request to a target server and stream the response back. */
export function forwardRequest(req, res, baseUrl, path) {
  const target = new URL(baseUrl + path);
  const lib = target.protocol === "https:" ? https : http;

  // Vite's middleware request object can carry pseudo-headers (e.g. ":method")
  // that are invalid as HTTP header names. Drop any header whose name is not a
  // valid HTTP token, plus hop-by-hop headers ("connection" is forbidden in
  // HTTP/2, which Vite serves over HTTPS).
  const headers = {};
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (!name || name.startsWith(":") || name === "host") continue;
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) continue;
    if (name === "connection" || name === "transfer-encoding" || name === "keep-alive") continue;
    headers[name] = value;
  }
  headers.host = target.host;

  const proxyReq = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: target.pathname + target.search,
      headers,
    },
    (proxyRes) => {
      // Strip hop-by-hop headers that HTTP/2 forbids on the response too
      // (e.g. transfer-encoding sent by Cloudflare upstream).
      const respHeaders = {};
      for (const [name, value] of Object.entries(proxyRes.headers || {})) {
        if (name === "connection" || name === "transfer-encoding" || name === "keep-alive") continue;
        respHeaders[name] = value;
      }
      res.writeHead(proxyRes.statusCode || 502, respHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
    } else {
      res.destroy(err);
    }
  });

  req.pipe(proxyReq);
}

/**
 * Express-style handler for the proxy route. Returns true when the request was
 * handled, false when it is not a proxy request.
 */
export function handleProxy(req, res) {
  if (!req.url.startsWith(PROXY_PREFIX)) return false;
  const { baseUrl, path } = parseProxyTarget(req.url);
  if (!baseUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid proxy target." }));
    return true;
  }
  forwardRequest(req, res, baseUrl, path);
  return true;
}
