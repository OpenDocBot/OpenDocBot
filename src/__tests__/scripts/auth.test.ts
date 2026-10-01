/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { PassThrough } from "node:stream";
import { mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// scripts/ lives outside the src tsconfig include, so it has no TS types.
// @ts-expect-error -- no type declarations for scripts/auth.mjs
import { loadAuthConfig, resolveSessionSecret, createAuth } from "../../../scripts/auth.mjs";

const ISSUER = "https://idp.example.com/tenant";
const CLIENT_ID = "client-123";
const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: "https://idp.example.com/authorize",
  token_endpoint: "https://idp.example.com/token",
  jwks_uri: "https://idp.example.com/jwks",
};

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signIdToken(payload: Record<string, unknown>): string {
  const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
  const h = b64urlJson(header);
  const p = b64urlJson(payload);
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");
  return `${h}.${p}.${sig}`;
}

function jsonRes(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function makeRes() {
  const res: any = { statusCode: null, headers: null, body: null };
  res.writeHead = (status: number, headers?: unknown) => {
    res.statusCode = status;
    res.headers = headers || {};
  };
  res.end = (body?: unknown) => {
    res.body = body === undefined ? null : body;
  };
  return res;
}

function makeReq(options: { url: string; method?: string; headers?: Record<string, string>; body?: unknown }) {
  const req: any = new PassThrough();
  req.url = options.url;
  req.method = options.method || "GET";
  req.headers = options.headers || {};
  req.end(options.body !== undefined ? JSON.stringify(options.body) : undefined);
  return req;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for handler");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function setup(
  overrides: {
    allowedGroups?: string[];
    groupsClaim?: string;
    idTokenPayload?: Record<string, unknown>;
  } = {}
) {
  let idToken = signIdToken({ noop: true });
  const fetchImpl = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes(".well-known")) return jsonRes(DISCOVERY);
    if (u === DISCOVERY.jwks_uri) return jsonRes({ keys: [jwk] });
    if (u === DISCOVERY.token_endpoint) {
      return jsonRes({ id_token: idToken, refresh_token: "refresh-token", expires_in: 3600 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  });

  const dir = mkdtempSync(join(tmpdir(), "odb-auth-"));
  const auth = createAuth({
    config: {
      issuer: ISSUER,
      clientId: CLIENT_ID,
      clientSecret: "secret",
      scopes: "openid profile email offline_access",
      redirectUri: "https://app.example.com/auth/callback",
      allowedGroups: overrides.allowedGroups || [],
      groupsClaim: overrides.groupsClaim,
    },
    storePath: join(dir, "sessions.json"),
    secret: "test-secret",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { auth, fetchImpl, dir, setIdToken: (t: string) => (idToken = t) };
}

async function startAndGetParams(auth: any, res: any) {
  const req = makeReq({ url: "/auth/start" });
  expect(auth.handle(req, res)).toBe(true);
  await waitFor(() => res.statusCode !== null);
  const location = new URL(res.headers.Location);
  return {
    state: location.searchParams.get("state")!,
    nonce: location.searchParams.get("nonce")!,
    location,
  };
}

describe("auth — loadAuthConfig", () => {
  it("returns null when nothing is configured", () => {
    expect(loadAuthConfig({})).toBeNull();
  });

  it("throws on a partial config", () => {
    expect(() => loadAuthConfig({ OPENDOCBOT_OIDC_ISSUER: ISSUER })).toThrow(/partially configured/);
  });

  it("parses a full config", () => {
    const cfg = loadAuthConfig({
      OPENDOCBOT_OIDC_ISSUER: `${ISSUER}/`,
      OPENDOCBOT_OIDC_CLIENT_ID: CLIENT_ID,
      OPENDOCBOT_OIDC_CLIENT_SECRET: "s",
      OPENDOCBOT_OIDC_ALLOWED_GROUPS: "g1, g2",
    });
    expect(cfg.issuer).toBe(ISSUER);
    expect(cfg.clientId).toBe(CLIENT_ID);
    expect(cfg.allowedGroups).toEqual(["g1", "g2"]);
  });

  it("defaults the groups claim to groups", () => {
    const cfg = loadAuthConfig({
      OPENDOCBOT_OIDC_ISSUER: ISSUER,
      OPENDOCBOT_OIDC_CLIENT_ID: CLIENT_ID,
    });
    expect(cfg.groupsClaim).toBe("groups");
  });

  it("reads a custom groups claim", () => {
    const cfg = loadAuthConfig({
      OPENDOCBOT_OIDC_ISSUER: ISSUER,
      OPENDOCBOT_OIDC_CLIENT_ID: CLIENT_ID,
      OPENDOCBOT_OIDC_GROUPS_CLAIM: "memberOf",
    });
    expect(cfg.groupsClaim).toBe("memberOf");
  });
});

describe("auth — resolveSessionSecret", () => {
  it("prefers the env value", () => {
    expect(resolveSessionSecret({ OPENDOCBOT_SESSION_SECRET: "abc" }, "/tmp/x/sessions.json")).toBe("abc");
  });

  it("generates and persists a secret next to the store", () => {
    const dir = mkdtempSync(join(tmpdir(), "odb-secret-"));
    const storePath = join(dir, "sessions.json");
    const secret = resolveSessionSecret({}, storePath);
    expect(secret.length).toBeGreaterThan(20);
    expect(existsSync(join(dir, "opendocbot-session.key"))).toBe(true);
    expect(statSync(join(dir, "opendocbot-session.key")).mode & 0o777).toBe(0o600);
    // Stable across calls.
    expect(resolveSessionSecret({}, storePath)).toBe(secret);
  });
});

describe("auth — full OIDC flow", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("starts with the expected authorize params", async () => {
    const res = makeRes();
    const { location } = await startAndGetParams(ctx.auth, res);
    expect(res.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe(DISCOVERY.authorization_endpoint);
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("redirect_uri")).toBe("https://app.example.com/auth/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("exchanges the code, validates the id_token, and issues a session", async () => {
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "user-1",
        email: "u@example.com",
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );

    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(302);
    const handoff = new URL(cbRes.headers.Location, "https://x").hash.replace("#code=", "");

    const exRes = makeRes();
    ctx.auth.handle(makeReq({ url: "/auth/exchange", method: "POST", body: { code: handoff } }), exRes);
    await waitFor(() => exRes.body !== null);
    expect(exRes.statusCode).toBe(200);
    const { sid, user } = JSON.parse(exRes.body);
    expect(user.email).toBe("u@example.com");

    const sessionRes = makeRes();
    ctx.auth.handle(makeReq({ url: "/auth/session", headers: { authorization: `Bearer ${sid}` } }), sessionRes);
    expect(sessionRes.statusCode).toBe(200);

    expect(ctx.auth.verifySession(makeReq({ url: "/x", headers: { authorization: `Bearer ${sid}` } }))).toBeTruthy();

    const logoutRes = makeRes();
    ctx.auth.handle(makeReq({ url: "/auth/logout", method: "POST", headers: { authorization: `Bearer ${sid}` } }), logoutRes);
    expect(logoutRes.statusCode).toBe(204);
    expect(ctx.auth.verifySession(makeReq({ url: "/x", headers: { authorization: `Bearer ${sid}` } }))).toBeNull();
  });

  it("rejects a bad nonce", async () => {
    const startRes = makeRes();
    const { state } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "user-1",
        nonce: "wrong",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
    expect(String(cbRes.body)).toContain("nonce");
  });

  it("rejects an unknown state", async () => {
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: "/auth/callback?code=abc&state=nope" }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
  });
});

describe("auth — proxy session header", () => {
  const PROXY_URL = "/proxy/https%3A%2F%2Fapi.example.com/v1/chat/completions";

  it("authenticates a proxied request that also carries the provider's Authorization", () => {
    const ctx = setup();
    const sid = ctx.auth.issueSessionForTest({ sub: "u1" });
    // Providers send their own API key in Authorization; the session rides in
    // the dedicated header. The proxy gate must use the session header.
    const req = makeReq({
      url: PROXY_URL,
      headers: {
        authorization: "Bearer sk-provider-key",
        "x-opendocbot-session": sid,
      },
    });
    expect(ctx.auth.verifyProxySession(req)).toBeTruthy();
    // Authorization alone must not be treated as a session.
    expect(ctx.auth.verifySession(req)).toBeNull();
  });

  it("accepts the session id in X-Opendocbot-Session (proxy requests)", () => {
    const ctx = setup();
    const sid = ctx.auth.issueSessionForTest({ sub: "u1" });
    const req = makeReq({ url: PROXY_URL, headers: { "x-opendocbot-session": sid } });
    expect(ctx.auth.verifyProxySession(req)).toBeTruthy();
  });

  it("rejects a proxied request with only a provider Authorization header", () => {
    const ctx = setup();
    ctx.auth.issueSessionForTest({ sub: "u1" });
    const req = makeReq({ url: PROXY_URL, headers: { authorization: "Bearer sk-provider-key" } });
    expect(ctx.auth.verifyProxySession(req)).toBeNull();
  });

  it("rejects a proxied request with no session header", () => {
    const ctx = setup();
    ctx.auth.issueSessionForTest({ sub: "u1" });
    const req = makeReq({ url: PROXY_URL });
    expect(ctx.auth.verifyProxySession(req)).toBeNull();
  });

  it("rejects a proxied request with an unknown session id", () => {
    const ctx = setup();
    ctx.auth.issueSessionForTest({ sub: "u1" });
    const req = makeReq({
      url: PROXY_URL,
      headers: { authorization: "Bearer sk-provider-key", "x-opendocbot-session": "nope" },
    });
    expect(ctx.auth.verifyProxySession(req)).toBeNull();
  });
});

describe("auth — group restriction", () => {
  it("denies a user not in an allowed group", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        groups: ["g-other"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
    expect(String(cbRes.body)).toContain("allowed group");
  });

  it("explains when the id_token has no groups claim", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
    // The error page HTML-escapes quotes, so match the decoded wording.
    expect(String(cbRes.body)).toMatch(/groups.{0,8}claim in the id_token/);
  });

  it("matches a configured group regardless of casing", async () => {
    const ctx = setup({ allowedGroups: ["G-ALLOWED"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        groups: ["g-allowed"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(302);
  });

  it("reads a custom groups claim", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"], groupsClaim: "memberOf" });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        memberOf: ["g-allowed"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(302);
  });

  it("names the configured claim when it is missing", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"], groupsClaim: "memberOf" });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
    expect(String(cbRes.body)).toMatch(/memberOf.{0,8}claim in the id_token/);
  });

  it("accepts a single string groups claim", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        groups: "g-allowed",
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(302);
  });

  it("ignores non-string entries in the groups claim", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        groups: [123, { id: "g-allowed" }, null],
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
  });

  it("clearly rejects group overage", async () => {
    const ctx = setup({ allowedGroups: ["g-allowed"] });
    const startRes = makeRes();
    const { state, nonce } = await startAndGetParams(ctx.auth, startRes);
    ctx.setIdToken(
      signIdToken({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "u",
        nonce,
        _claim_names: { groups: "src1" },
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    const cbRes = makeRes();
    ctx.auth.handle(makeReq({ url: `/auth/callback?code=abc&state=${state}` }), cbRes);
    await waitFor(() => cbRes.statusCode !== null);
    expect(cbRes.statusCode).toBe(400);
    expect(String(cbRes.body)).toContain("overage");
  });
});
