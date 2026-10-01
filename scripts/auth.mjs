/**
 * OIDC authentication for self-hosted deployments (Phase C).
 *
 * Establishes who the user is via the Office dialog flow, keeps a server-side
 * session, and exposes it so /app-config.json can be gated. The browser never
 * holds IdP tokens: it only receives a short-lived opaque session id via
 * messageParent. See docs/enterprise/sso.
 *
 * Design choices:
 * - OIDC authorization code + PKCE, discovery-driven, IdP agnostic.
 * - ID tokens validated with node:crypto (RS256), no JWT dependency.
 * - Sessions in a JSON file; refresh tokens encrypted at rest (AES-256-GCM).
 * - Self-hosted only: vendors never broker tokens.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STATE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;
/** Cap on concurrently pending sign-in states/handoffs, to bound memory. */
const MAX_PENDING_STATES = 5000;
const MAX_PENDING_HANDOFFS = 5000;
/** Persist a sliding session expiry at most this often (ms). */
const SESSION_PERSIST_INTERVAL_MS = 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function fromB64url(value) {
  return Buffer.from(value, "base64url");
}
function randomToken(bytes = 32) {
  return b64url(crypto.randomBytes(bytes));
}

/**
 * Read the OIDC config from env. Returns null when OIDC is not configured so
 * the instance runs without SSO. Throws on a partial config so a typo fails
 * loudly at startup rather than silently leaving the endpoint ungated.
 */
export function loadAuthConfig(env = process.env) {
  const get = (key) => (env[key] || "").trim();
  const issuer = get("OPENDOCBOT_OIDC_ISSUER").replace(/\/$/, "");
  const clientId = get("OPENDOCBOT_OIDC_CLIENT_ID");
  const clientSecret = get("OPENDOCBOT_OIDC_CLIENT_SECRET");
  const scopes = get("OPENDOCBOT_OIDC_SCOPES") || "openid profile email offline_access";
  const redirectUri = get("OPENDOCBOT_OIDC_REDIRECT_URI") || null;
  const allowedGroups = get("OPENDOCBOT_OIDC_ALLOWED_GROUPS")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  // Claim that carries group membership. "groups" is the common convention but
  // it is not standard, so providers that use another name (memberOf, a
  // namespaced claim) can point at it.
  const groupsClaim = get("OPENDOCBOT_OIDC_GROUPS_CLAIM") || "groups";

  if (!issuer && !clientId && !clientSecret) return null;
  if (!issuer || !clientId) {
    throw new Error(
      "OIDC is partially configured: set OPENDOCBOT_OIDC_ISSUER and OPENDOCBOT_OIDC_CLIENT_ID (and OPENDOCBOT_OIDC_CLIENT_SECRET for a confidential client), or none of them."
    );
  }
  return { issuer, clientId, clientSecret, scopes, redirectUri, allowedGroups, groupsClaim };
}

/**
 * Resolve the session-secret used to encrypt stored refresh tokens. Uses the
 * env var when set, otherwise generates one and persists it next to the store
 * (0600) so restarts keep sessions valid.
 */
export function resolveSessionSecret(env, storePath) {
  const fromEnv = (env.OPENDOCBOT_SESSION_SECRET || "").trim();
  if (fromEnv) return fromEnv;

  const keyPath = path.join(path.dirname(storePath), "opendocbot-session.key");
  try {
    if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, "utf8").trim();
    const secret = randomToken(32);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, secret, { mode: 0o600 });
    console.log(`[opendocbot] generated session secret at ${keyPath}`);
    return secret;
  } catch (err) {
    throw new Error(
      `could not read or generate a session secret at ${keyPath} (${err.message}). Set OPENDOCBOT_SESSION_SECRET explicitly, or use a writable session store directory.`
    );
  }
}

function deriveKey(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(secret, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

function decrypt(secret, value) {
  const [iv, tag, ct] = value.split(".").map(fromB64url);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** JSON-file session store with atomic writes. */
class SessionStore {
  constructor(file, secret) {
    this.file = file;
    this.secret = secret;
    this.sessions = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        this.sessions = parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {};
      }
    } catch (err) {
      console.error(`[opendocbot] could not read session store ${this.file}: ${err.message}`);
      this.sessions = {};
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, sessions: this.sessions }), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error(`[opendocbot] could not write session store ${this.file}: ${err.message}`);
    }
  }

  get(sid) {
    return this.sessions[sid] || null;
  }
  set(session) {
    this.sessions[session.sid] = session;
    this.save();
  }
  delete(sid) {
    if (this.sessions[sid]) {
      delete this.sessions[sid];
      this.save();
    }
  }
}

function publicUser(session) {
  return { sub: session.sub, email: session.email, name: session.name, groups: session.groups || [] };
}

function bearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();
  // Provider requests reuse `Authorization` for the provider's own API key, so
  // proxied requests carry the session in a dedicated header instead.
  const session = req.headers?.["x-opendocbot-session"];
  if (typeof session === "string" && session.trim()) return session.trim();
  return null;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Create the auth service. Discovery and JWKS are fetched lazily and cached.
 * Returns an object with `handle(req, res)` (Express-style, returns true when
 * it handled the request), `verifySession(req)` (sync) and `authRequired`.
 */
export function createAuth({ config, storePath, secret, fetchImpl = fetch, now = () => Date.now() }) {
  const store = new SessionStore(storePath, secret);
  const states = new Map();
  const handoffs = new Map();
  let discovery = null;
  let jwks = null;
  const refreshes = new Set();

  /** Drop expired entries so the pending maps cannot grow without bound. */
  function pruneMap(map, ttlMs) {
    const current = now();
    for (const [key, entry] of map) {
      if (current - entry.createdAt > ttlMs) map.delete(key);
    }
  }

  async function ensureDiscovery() {
    if (discovery) return discovery;
    const res = await fetchImpl(`${config.issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
    discovery = await res.json();
    return discovery;
  }

  async function ensureJwks(force = false) {
    const doc = await ensureDiscovery();
    if (jwks && !force) return jwks;
    const res = await fetchImpl(doc.jwks_uri);
    if (!res.ok) throw new Error(`OIDC JWKS fetch failed: HTTP ${res.status}`);
    jwks = await res.json();
    return jwks;
  }

  function verifyIdToken(idToken, nonce, keys) {
    const parts = String(idToken).split(".");
    if (parts.length !== 3) throw new Error("malformed id_token");
    const [headerPart, payloadPart, sigPart] = parts;
    const header = JSON.parse(fromB64url(headerPart).toString("utf8"));
    const payload = JSON.parse(fromB64url(payloadPart).toString("utf8"));
    if (header.alg !== "RS256") throw new Error(`unsupported id_token alg: ${header.alg}`);
    const key = keys.keys.find((k) => (header.kid ? k.kid === header.kid : false)) || keys.keys[0];
    if (!key) throw new Error("no matching JWKS key");
    const pub = crypto.createPublicKey({ key, format: "jwk" });
    const valid = crypto
      .createVerify("RSA-SHA256")
      .update(`${headerPart}.${payloadPart}`)
      .verify(pub, fromB64url(sigPart));
    if (!valid) throw new Error("invalid id_token signature");
    if (payload.iss !== config.issuer) throw new Error(`invalid id_token issuer: ${payload.iss}`);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(config.clientId)) throw new Error("invalid id_token audience");
    const nowSec = Math.floor(now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < nowSec) throw new Error("id_token expired");
    if (typeof payload.nbf === "number" && payload.nbf > nowSec + 60) throw new Error("id_token not yet valid");
    if (nonce && payload.nonce !== nonce) throw new Error("invalid id_token nonce");
    return payload;
  }

  /**
   * Normalize the configured group claim into a list of trimmed strings. The
   * claim may be a list or a single string; anything else counts as no groups.
   * `overage` mirrors the distributed-claims signal keyed by the claim name.
   */
  function readGroups(payload) {
    const claim = config.groupsClaim || "groups";
    const raw = payload[claim];
    const groups = Array.isArray(raw)
      ? raw.filter((g) => typeof g === "string").map((g) => g.trim()).filter(Boolean)
      : typeof raw === "string" && raw.trim()
        ? [raw.trim()]
        : [];
    const overage = Boolean(payload._claim_names && payload._claim_names[claim]);
    return { claim, groups, overage };
  }

  function checkGroups(payload) {
    if (config.allowedGroups.length === 0) return;

    const { claim, groups, overage } = readGroups(payload);
    // Group IDs are GUIDs: compare case-insensitively so a differently-cased
    // configured value still matches.
    const allowed = new Set(config.allowedGroups.map((g) => g.toLowerCase()));
    const matched = !overage && groups.some((g) => allowed.has(g.toLowerCase()));
    if (overage || !matched) {
      // Logged only on failure, with a timestamp, so a mismatch (missing claim,
      // names instead of object IDs, or a different claim name) shows up
      // without noise on successful sign-ins.
      console.warn(
        `[opendocbot] ${new Date().toISOString()} group check failed: ` +
          `claim=${claim} allowed=${JSON.stringify(config.allowedGroups)} ` +
          `received=${JSON.stringify(groups)} overage=${overage} claims=${Object.keys(payload).join(",")}`
      );
      if (overage) {
        throw new Error(
          "group overage: the user belongs to too many groups to list in the token. Reduce group membership or use app roles."
        );
      }
      throw new Error(
        groups.length === 0
          ? `access denied: no "${claim}" claim in the id_token (enable the groups claim in your identity provider).`
          : "access denied: the user is not in an allowed group."
      );
    }
  }

  function redirectUriFor(req) {
    if (config.redirectUri) return config.redirectUri;
    // HTTP/2 (Vite dev over TLS) omits `host` and uses `:authority` instead.
    const host = req.headers?.host || req.headers?.[":authority"] || "localhost";
    return `https://${host}/auth/callback`;
  }

  function beginSignIn(req, res) {
    pruneMap(states, STATE_TTL_MS);
    if (states.size >= MAX_PENDING_STATES) {
      respondJson(res, 503, { error: "Too many pending sign-ins. Try again shortly." });
      return;
    }
    const state = randomToken(24);
    const verifier = randomToken(48);
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const nonce = randomToken(24);
    const redirectUri = redirectUriFor(req);
    states.set(state, { verifier, nonce, redirectUri, createdAt: now() });

    const authorize = new URL(discovery.authorization_endpoint);
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", config.scopes);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("response_mode", "query");
    res.writeHead(302, { Location: authorize.toString() });
    res.end();
  }

  async function exchangeCode(code, redirectUri, verifier) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    });
    if (config.clientSecret) body.set("client_secret", config.clientSecret);
    const res = await fetchImpl(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
    return res.json();
  }

  async function refreshAccessToken(session) {
    if (!session.refreshTokenEnc) return;
    const refreshToken = decrypt(secret, session.refreshTokenEnc);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      scope: config.scopes,
    });
    if (config.clientSecret) body.set("client_secret", config.clientSecret);
    const res = await fetchImpl(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) {
      store.delete(session.sid);
      return;
    }
    const tokens = await res.json();
    session.accessTokenExp = now() + (tokens.expires_in ? tokens.expires_in * 1000 : 0);
    if (tokens.refresh_token) session.refreshTokenEnc = encrypt(secret, tokens.refresh_token);
    store.set(session);
  }

  function maybeRefresh(session) {
    if (!session.refreshTokenEnc) return;
    if (session.accessTokenExp && session.accessTokenExp > now() + REFRESH_SKEW_MS) return;
    if (refreshes.has(session.sid)) return;
    refreshes.add(session.sid);
    refreshAccessToken(session).catch(() => {}).finally(() => refreshes.delete(session.sid));
  }

  /** Look up and touch a session by its opaque id. */
  function sessionForSid(sid) {
    if (!sid) return null;
    const session = store.get(sid);
    if (!session) return null;
    if (session.expiresAt && session.expiresAt < now()) {
      store.delete(sid);
      return null;
    }
    session.lastSeenAt = now();
    session.expiresAt = now() + DEFAULT_SESSION_TTL_MS;
    maybeRefresh(session);
    // Persist the sliding expiry (throttled) so a restart does not drop a
    // session that is still active in memory.
    if (!session.lastPersistedAt || now() - session.lastPersistedAt > SESSION_PERSIST_INTERVAL_MS) {
      session.lastPersistedAt = now();
      store.set(session);
    }
    return session;
  }

  /** Session id from the dedicated header, used by proxied provider requests. */
  function sessionHeader(req) {
    const raw = req.headers?.["x-opendocbot-session"];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }

  function verifySession(req) {
    return sessionForSid(bearerToken(req));
  }

  /**
   * Verify a proxied provider request. Those requests carry the provider's own
   * API key in `Authorization`, so the session must come from the dedicated
   * `X-Opendocbot-Session` header and never from `Authorization`.
   */
  function verifyProxySession(req) {
    return sessionForSid(sessionHeader(req));
  }

  function currentUser(req) {
    const session = verifySession(req);
    return session ? publicUser(session) : null;
  }

  async function finishCallback(req, res, url) {
    try {
      const error = url.searchParams.get("error");
      if (error) {
        throw new Error(url.searchParams.get("error_description") || error);
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const entry = state ? states.get(state) : null;
      if (!entry || now() - entry.createdAt > STATE_TTL_MS) {
        throw new Error("invalid or expired state, please try signing in again.");
      }
      states.delete(state);

      const tokens = await exchangeCode(code, entry.redirectUri, entry.verifier);
      const keys = await ensureJwks();
      let payload;
      try {
        payload = verifyIdToken(tokens.id_token, entry.nonce, keys);
      } catch (err) {
        // A key rotation can invalidate the cached JWKS; retry once.
        const refreshed = await ensureJwks(true);
        payload = verifyIdToken(tokens.id_token, entry.nonce, refreshed);
      }
      checkGroups(payload);

      const session = {
        sid: randomToken(32),
        sub: payload.sub,
        email: payload.email || payload.preferred_username || null,
        name: payload.name || null,
        groups: readGroups(payload).groups,
        refreshTokenEnc: tokens.refresh_token ? encrypt(secret, tokens.refresh_token) : null,
        accessTokenExp: now() + (tokens.expires_in ? tokens.expires_in * 1000 : 0),
        createdAt: now(),
        lastSeenAt: now(),
        expiresAt: now() + DEFAULT_SESSION_TTL_MS,
      };
      store.set(session);

      const handoff = randomToken(24);
      handoffs.set(handoff, { sid: session.sid, createdAt: now() });
      pruneMap(handoffs, HANDOFF_TTL_MS);
      while (handoffs.size > MAX_PENDING_HANDOFFS) {
        handoffs.delete(handoffs.keys().next().value);
      }
      res.writeHead(302, { Location: `/auth/complete.html#code=${handoff}` });
      res.end();
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><body style="font-family:monospace;padding:24px"><h3>Sign-in failed</h3><p>${escapeHtml(
          err.message
        )}</p></body></html>`
      );
    }
  }

  async function handleExchange(req, res) {
    pruneMap(handoffs, HANDOFF_TTL_MS);
    const body = await readJsonBody(req);
    const entry = body.code ? handoffs.get(body.code) : null;
    if (!entry || now() - entry.createdAt > HANDOFF_TTL_MS) {
      respondJson(res, 400, { error: "invalid or expired handoff code" });
      return;
    }
    handoffs.delete(body.code);
    const session = store.get(entry.sid);
    if (!session) {
      respondJson(res, 401, { error: "session not found" });
      return;
    }
    respondJson(res, 200, { sid: session.sid, user: publicUser(session) });
  }

  function handleSession(req, res) {
    const user = currentUser(req);
    if (!user) {
      respondJson(res, 401, { error: "unauthenticated" });
      return;
    }
    respondJson(res, 200, { user });
  }

  function handleLogout(req, res) {
    const sid = bearerToken(req);
    if (sid) store.delete(sid);
    res.writeHead(204);
    res.end();
  }

  function handle(req, res) {
    const url = new URL(req.url || "/", `https://${req.headers?.host || "localhost"}`);
    const p = url.pathname;
    if (p === "/auth/start") {
      void ensureDiscovery()
        .then(() => beginSignIn(req, res))
        .catch((err) => respondJson(res, 502, { error: err.message }));
      return true;
    }
    if (p === "/auth/callback") {
      void ensureDiscovery()
        .then(() => finishCallback(req, res, url))
        .catch((err) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        });
      return true;
    }
    if (p === "/auth/exchange" && req.method === "POST") {
      void handleExchange(req, res);
      return true;
    }
    if (p === "/auth/session") {
      handleSession(req, res);
      return true;
    }
    if (p === "/auth/logout" && req.method === "POST") {
      handleLogout(req, res);
      return true;
    }
    return false;
  }

  return {
    authRequired: true,
    handle,
    verifySession,
    verifyProxySession,
    currentUser,
    issueSessionForTest: (claims) => {
      const session = {
        sid: randomToken(32),
        sub: claims.sub,
        email: claims.email || null,
        name: claims.name || null,
        groups: claims.groups || [],
        refreshTokenEnc: null,
        accessTokenExp: now() + 3600_000,
        createdAt: now(),
        lastSeenAt: now(),
        expiresAt: now() + DEFAULT_SESSION_TTL_MS,
      };
      store.set(session);
      return session.sid;
    },
  };
}

function respondJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
