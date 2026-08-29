/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { handleProxy } from "./scripts/proxy.mjs";

const certPath = path.join(os.homedir(), ".opendocbot-cert.pem");
const keyPath = path.join(os.homedir(), ".opendocbot-key.pem");

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
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/proxy/")) return next();
          handleProxy(req, res);
        });
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
