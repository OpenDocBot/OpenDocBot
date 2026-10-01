#!/usr/bin/env node
/**
 * Static file server for the built add-in (dist/) with the /proxy/ route.
 * Used for self-hosted deployments — either directly (`node scripts/serve.mjs`)
 * or via the Docker image.
 *
 *   PORT            Port to listen on (default 3000)
 *   HOST            Hostname to bind (default 0.0.0.0)
 *   DIST_DIR        Path to the built app (default ./dist)
 *   TLS_CERT        HTTPS certificate (optional; enables HTTPS). Can be a path
 *                   to a PEM file, the PEM content itself, or its base64 form.
 *   TLS_KEY         Matching private key. Same accepted forms as TLS_CERT.
 *
 *   OPENDOCBOT_MANAGED_CONFIG        Inline JSON of forced config keys (optional)
 *   OPENDOCBOT_MANAGED_CONFIG_FILE   Path to a JSON file with forced keys (optional)
 *
 *   OPENDOCBOT_OIDC_ISSUER           OIDC issuer URL (enables SSO when set)
 *   OPENDOCBOT_OIDC_CLIENT_ID        OIDC client id
 *   OPENDOCBOT_OIDC_CLIENT_SECRET    OIDC client secret (optional with PKCE)
 *   OPENDOCBOT_OIDC_SCOPES           Space-separated scopes (default openid profile email offline_access)
 *   OPENDOCBOT_OIDC_REDIRECT_URI     Override the computed redirect URI
 *   OPENDOCBOT_OIDC_ALLOWED_GROUPS   Comma-separated group ids (empty = any user)
 *   OPENDOCBOT_SESSION_STORE         Session store JSON path
 *   OPENDOCBOT_SESSION_SECRET        Key that encrypts stored refresh tokens
 *
 * Office requires the add-in to be served over HTTPS. When TLS_CERT/TLS_KEY are
 * set (or default files ~/.opendocbot-cert.pem and ~/.opendocbot-key.pem exist),
 * the server listens with HTTPS. Otherwise it falls back to plain HTTP.
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleProxy } from "./proxy.mjs";
import { handleAppConfig, loadManagedConfig, injectManagedBootstrap, managedRequiresSso, assertManagedRequiresSso } from "./managedConfig.mjs";
import { createAuth, loadAuthConfig, resolveSessionSecret } from "./auth.mjs";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = path.resolve(
  process.env.DIST_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist")
);

const DEFAULT_CERT = path.join(os.homedir(), ".opendocbot-cert.pem");
const DEFAULT_KEY = path.join(os.homedir(), ".opendocbot-key.pem");

/**
 * Resolve a TLS secret (cert or key) from an env var. Accepts, in order:
 *   1. A path to an existing PEM file.
 *   2. The PEM content itself (starts with "-----BEGIN").
 *   3. The base64-encoded PEM content (decoded on the fly).
 * Falls back to a default file path when no env var is set.
 */
function resolveTlsSecret(envName, defaultPath) {
  const raw = process.env[envName];
  if (raw && raw.trim().length > 0) {
    const value = raw.trim();
    if (value.startsWith("-----BEGIN")) return value;
    if (fs.existsSync(value) && fs.statSync(value).size > 0) {
      return fs.readFileSync(value, "utf8");
    }
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      if (decoded.startsWith("-----BEGIN")) return decoded;
    } catch {
      /* not base64 */
    }
    return value;
  }
  if (fs.existsSync(defaultPath) && fs.statSync(defaultPath).size > 0) {
    return fs.readFileSync(defaultPath, "utf8");
  }
  return null;
}

const TLS_CERT = resolveTlsSecret("TLS_CERT", DEFAULT_CERT);
const TLS_KEY = resolveTlsSecret("TLS_KEY", DEFAULT_KEY);

const useTLS = Boolean(TLS_CERT && TLS_KEY);

// Fail loudly at startup on a malformed managed config instead of silently
// serving no config (which would leave the add-in in local mode).
let MANAGED_CONFIG;
try {
  MANAGED_CONFIG = loadManagedConfig();
} catch (err) {
  console.error(`[opendocbot] ${err.message}`);
  process.exit(1);
}

// Optional OIDC SSO. When configured, /app-config.json requires a session and
// the client is told (via the bootstrap marker) to show a sign-in gate.
let AUTH = null;
try {
  const authConfig = loadAuthConfig();
  if (authConfig) {
    const storePath =
      process.env.OPENDOCBOT_SESSION_STORE ||
      path.join(os.homedir(), ".opendocbot-sessions.json");
    const secret = resolveSessionSecret(process.env, storePath);
    AUTH = createAuth({ config: authConfig, storePath, secret });
  }
} catch (err) {
  console.error(`[opendocbot] ${err.message}`);
  process.exit(1);
}

// A managed config must not be served without authentication unless the
// operator explicitly opts out.
const REQUIRE_SSO = managedRequiresSso();
try {
  assertManagedRequiresSso({
    managed: Boolean(MANAGED_CONFIG),
    authEnabled: Boolean(AUTH),
    requireSso: REQUIRE_SSO,
  });
} catch (err) {
  console.error(`[opendocbot] ${err.message}`);
  process.exit(1);
}

// index.html with the managed-config bootstrap marker injected (or stripped)
// based on the runtime env. Computed once so every index.html response is
// consistent. The client only probes /app-config.json when the marker is
// present, so unmanaged instances make no config request at all.
const INDEX_HTML_PATH = path.join(DIST_DIR, "index.html");
let INDEX_HTML = null;
try {
  if (fs.existsSync(INDEX_HTML_PATH)) {
    INDEX_HTML = injectManagedBootstrap(
      fs.readFileSync(INDEX_HTML_PATH, "utf8"),
      MANAGED_CONFIG,
      Boolean(AUTH)
    );
  }
} catch (err) {
  console.error(`[opendocbot] could not prepare index.html: ${err.message}`);
  process.exit(1);
}

/**
 * Hardened CSP for the taskpane (index.html) only. Enforced in addition to the
 * permissive <meta> CSP (which stays for dev and static hosts), so it can only
 * tighten. It drops 'unsafe-inline' scripts (the main XSS vector; the built
 * bundle has no inline scripts) and locks down object/base/form. 'unsafe-eval'
 * is retained for Office.js and Tesseract until it can be validated in Office;
 * remove it once confirmed. `https:` keeps the Tesseract core/lang CDN and
 * Office.js reachable, and `frame-ancestors` is intentionally unset so Office
 * can embed the add-in. The sign-in completion page is deliberately excluded:
 * it relies on an inline script.
 */
const ADDIN_CSP = [
  "default-src 'self' https:",
  "script-src 'self' https: 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.normalize(path.join(DIST_DIR, urlPath));
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback: serve index.html for unknown paths.
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
  // Only meaningful over HTTPS; browsers ignore HSTS on plain HTTP.
  if (useTLS) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  if (urlPath === "/manifest.xml") {
    headers["Content-Disposition"] = 'attachment; filename="manifest.xml"';
  }
  // Serve the prepared index.html (with the managed-config marker) for both
  // the real file and the SPA fallback, so the marker is always present when
  // managed and never present when not.
  const isAddinIndex =
    INDEX_HTML !== null && path.resolve(filePath) === path.resolve(INDEX_HTML_PATH);
  // Strict CSP for the taskpane. No X-Frame-Options / frame-ancestors here: the
  // self-hosted server serves the add-in itself, which Office must be able to
  // embed in the taskpane.
  if (isAddinIndex) headers["Content-Security-Policy"] = ADDIN_CSP;
  res.writeHead(200, headers);

  if (isAddinIndex) {
    res.end(INDEX_HTML);
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

const PROXY_PREFIX = "/proxy/";

function unauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "Unauthenticated." }));
}

const handler = (req, res) => {
  // On SSO instances the proxy is a server-side request forwarder and must not
  // be an open relay: require a session before forwarding (the client sends the
  // session in `X-Opendocbot-Session`).
  if (AUTH && (req.url || "").startsWith(PROXY_PREFIX) && !AUTH.verifyProxySession(req)) {
    unauthorized(res);
    return;
  }
  if (handleProxy(req, res)) return;
  // Auth routes (/auth/*) and the managed endpoint must run before serveStatic:
  // its SPA fallback returns index.html with 200 for unknown paths.
  if (AUTH && AUTH.handle(req, res)) return;
  if (handleAppConfig(req, res, MANAGED_CONFIG, AUTH)) return;
  serveStatic(req, res);
};

const server = useTLS
  ? https.createServer({ cert: TLS_CERT, key: TLS_KEY }, handler)
  : http.createServer(handler);

server.listen(PORT, HOST, () => {
  console.log(`[opendocbot] serving ${DIST_DIR} at ${useTLS ? "https" : "http"}://${HOST}:${PORT} (proxy enabled, tls=${useTLS}, managed=${Boolean(MANAGED_CONFIG)}, sso=${Boolean(AUTH)}, requireSso=${REQUIRE_SSO})`);
});
