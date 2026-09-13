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
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
}

const handler = (req, res) => {
  if (handleProxy(req, res)) return;
  serveStatic(req, res);
};

const server = useTLS
  ? https.createServer({ cert: TLS_CERT, key: TLS_KEY }, handler)
  : http.createServer(handler);

server.listen(PORT, HOST, () => {
  console.log(`[opendocbot] serving ${DIST_DIR} at ${useTLS ? "https" : "http"}://${HOST}:${PORT} (proxy enabled, tls=${useTLS})`);
});
