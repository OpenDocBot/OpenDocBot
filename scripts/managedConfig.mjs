/**
 * Managed-configuration endpoint for self-hosted deployments.
 *
 * A self-hosted instance can force a subset of the add-in configuration at run
 * time (see docs/enterprise/managed-configuration). The admin supplies the forced
 * keys as JSON via OPENDOCBOT_MANAGED_CONFIG (inline) or
 * OPENDOCBOT_MANAGED_CONFIG_FILE (a path). The add-in fetches it same-origin
 * from /app-config.json; a 404 means "not managed".
 *
 * Only the self-hosted Node server (scripts/serve.mjs) serves this route. The
 * route must be registered before the static-file SPA fallback, which returns
 * index.html with 200 for unknown paths and would otherwise swallow the 404
 * sentinel the client relies on.
 */

import fs from "node:fs";

export const APP_CONFIG_PATH = "/app-config.json";

/**
 * Name of the bootstrap <meta> the server injects into index.html. Its mere
 * presence tells the client the deployment is managed, so unmanaged instances
 * never probe /app-config.json. The client duplicates this literal (it cannot
 * import this module); keep the two in sync.
 */
export const BOOTSTRAP_META_NAME = "odb-managed";

/**
 * Whether a managed config requires SSO. Defaults to true: an unauthenticated
 * endpoint must not serve configuration, since it may contain credentials.
 * Set OPENDOCBOT_MANAGED_REQUIRE_SSO=false to explicitly allow an open config.
 */
export function managedRequiresSso(env = process.env) {
  const raw = env.OPENDOCBOT_MANAGED_REQUIRE_SSO;
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  const value = String(raw).trim().toLowerCase();
  return !(value === "false" || value === "0");
}

/**
 * Fail fast when a managed config is present without SSO while SSO is required
 * (the default). Call at startup so a misconfiguration never exposes config.
 */
export function assertManagedRequiresSso({ managed, authEnabled, requireSso }) {
  if (requireSso && managed && !authEnabled) {
    throw new Error(
      "Managed config is set but SSO is not configured. Configure OPENDOCBOT_OIDC_* or set OPENDOCBOT_MANAGED_REQUIRE_SSO=false to allow an unauthenticated managed config."
    );
  }
}

/**
 * Read the managed config from env. Returns null when nothing is configured so
 * the caller can treat the instance as unmanaged. Throws on malformed JSON or
 * an unreadable file so a misconfiguration fails loudly at startup instead of
 * silently serving no config.
 */
export function loadManagedConfig(env = process.env) {
  const inline = env.OPENDOCBOT_MANAGED_CONFIG;
  const file = env.OPENDOCBOT_MANAGED_CONFIG_FILE;

  let raw = null;
  if (typeof inline === "string" && inline.trim().length > 0) {
    raw = inline;
  } else if (typeof file === "string" && file.trim().length > 0) {
    try {
      raw = fs.readFileSync(file.trim(), "utf8");
    } catch (err) {
      throw new Error(
        `OPENDOCBOT_MANAGED_CONFIG_FILE could not be read (${file}): ${err.message}`
      );
    }
  }
  if (raw === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`OPENDOCBOT managed config is not valid JSON: ${err.message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("OPENDOCBOT managed config must be a JSON object.");
  }

  return { managedConfig: parsed };
}

/**
 * Inject (or strip) the managed-config bootstrap marker in an index.html
 * string. The marker separates two concerns:
 *   - `managed`: a config exists, so the client should fetch /app-config.json.
 *   - `sso`: a session is required (a sign-in gate).
 * A deployment may have SSO without a managed config, in which case the marker
 * is present with `managed:false`, so the client gates on sign-in but never
 * probes the config endpoint. Existing markers are removed first so a leftover
 * build-time marker can never linger.
 */
export function injectManagedBootstrap(html, config, sso = false) {
  const cleaned = html.replace(
    new RegExp(`\\s*<meta\\s+name=["']${BOOTSTRAP_META_NAME}["'][^>]*>`, "gi"),
    ""
  );
  if (!config && !sso) return cleaned;

  const content = JSON.stringify({
    managed: Boolean(config),
    sso: Boolean(sso),
  });
  const tag = `<meta name="${BOOTSTRAP_META_NAME}" content='${content}'>`;
  if (cleaned.includes("</head>")) {
    return cleaned.replace("</head>", `  ${tag}\n  </head>`);
  }
  return `${tag}\n${cleaned}`;
}

/**
 * Resolve the payload for one request. The seam for future dynamic logic
 * (per-department keys). For now it ignores the request and returns the static
 * config resolved at startup.
 */
export function resolveManagedConfig(_req, config) {
  return config;
}

/**
 * Express-style handler for the managed-config route. Returns true when the
 * request was handled, false when it is not the app-config request. When the
 * instance is unmanaged it answers 404 (the client's "local mode" sentinel).
 * When auth is enabled, a valid session is required (401 otherwise).
 */
export function handleAppConfig(req, res, config, auth = null) {
  const urlPath = (req.url || "").split("?")[0];
  if (urlPath !== APP_CONFIG_PATH) return false;

  if (auth && !auth.verifySession(req)) {
    res.writeHead(401, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "Unauthenticated." }));
    return true;
  }

  const payload = resolveManagedConfig(req, config);
  if (!payload) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not managed." }));
    return true;
  }

  const body = JSON.stringify(payload);
  res.writeHead(200, {
    "Content-Type": "application/json",
    // Never cache the managed config: an admin's change must take effect on the
    // next load, unlike the immutable hashed assets.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
  return true;
}
