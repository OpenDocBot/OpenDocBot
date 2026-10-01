/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { handleProxy } from "./scripts/proxy.mjs";
import { handleAppConfig, loadManagedConfig, injectManagedBootstrap, managedRequiresSso, assertManagedRequiresSso } from "./scripts/managedConfig.mjs";
import { createAuth, loadAuthConfig, resolveSessionSecret } from "./scripts/auth.mjs";

const certPath = path.join(os.homedir(), ".opendocbot-cert.pem");
const keyPath = path.join(os.homedir(), ".opendocbot-key.pem");

/**
 * Load `.env` into `process.env` for the dev server. Vite only exposes
 * `VITE_`-prefixed vars to the client, so server-side vars (the managed
 * config) would otherwise be invisible to `vite.config.ts` under `npm run dev`.
 * Values are taken raw (no quote stripping) to match the runtime server, which
 * reads the same variables from the environment.
 */
function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(__dirname, ".env"));

// Resolve the managed config once at dev-server start. Fail fast on a
// malformed value so a typo aborts `npm run dev` with a clear message,
// matching scripts/serve.mjs.
const managedConfig = loadManagedConfig();

// Optional OIDC SSO, mirroring scripts/serve.mjs. Configured via the same env
// (loaded from .env above).
const auth = (() => {
  try {
    const authConfig = loadAuthConfig();
    if (!authConfig) return null;
    const storePath =
      process.env.OPENDOCBOT_SESSION_STORE ||
      path.join(os.homedir(), ".opendocbot-sessions.json");
    const secret = resolveSessionSecret(process.env, storePath);
    return createAuth({ config: authConfig, storePath, secret });
  } catch (err) {
    throw new Error(`[opendocbot] ${(err as Error).message}`, { cause: err });
  }
})();

// A managed config must not be served without authentication unless the
// operator explicitly opts out (mirrors scripts/serve.mjs).
assertManagedRequiresSso({
  managed: Boolean(managedConfig),
  authEnabled: Boolean(auth),
  requireSso: managedRequiresSso(process.env),
});

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));

// Unique per build/dev-server-start so you can tell exactly which bundle a
// taskpane is running (and catch stale Office WebView caches).
function computeBuildId() {
  let git = "no-git";
  try {
    git = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    /* not a git checkout */
  }
  return `${git}-${Date.now().toString(36)}`;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "opendocbot-proxy",
      configureServer(server) {
        // Same-origin /proxy/<encoded-baseUrl>/<path> forwarding (no CORS).
        // On SSO instances the proxy requires a session (mirrors serve.mjs).
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/proxy/")) return next();
          if (auth && !auth.verifyProxySession(req)) {
            res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ error: "Unauthenticated." }));
            return;
          }
          handleProxy(req, res);
        });
        // Same-origin managed config (mirrors scripts/serve.mjs). Registered
        // here so it runs before Vite's SPA fallback, keeping the 404 sentinel
        // that tells the client the instance is unmanaged.
        server.middlewares.use((req, res, next) => {
          if (auth && auth.handle(req, res)) return;
          if (!handleAppConfig(req, res, managedConfig, auth)) return next();
        });
      },
    },
    {
      // Dev-only: inject the managed-config marker into index.html. Production
      // injection is runtime, in scripts/serve.mjs, so a Docker rebuild is not
      // needed to enable management. `apply: "serve"` keeps this out of builds.
      name: "opendocbot-managed-bootstrap",
      apply: "serve",
      transformIndexHtml(html) {
        return injectManagedBootstrap(html, managedConfig, Boolean(auth));
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: process.env.VITE_BASE || "/",
  define: {
    __BUILD_ID__: JSON.stringify(computeBuildId()),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    https: {
      cert: certPath,
      key: keyPath,
    },
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
