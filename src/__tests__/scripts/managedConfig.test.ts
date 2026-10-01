/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// scripts/ lives outside the src tsconfig include, so it has no TS types.
// @ts-expect-error -- no type declarations for scripts/managedConfig.mjs
import { loadManagedConfig, handleAppConfig, resolveManagedConfig, injectManagedBootstrap, managedRequiresSso, assertManagedRequiresSso } from "../../../scripts/managedConfig.mjs";

function makeRes() {
  const res: any = {};
  res.writeHead = vi.fn();
  res.end = vi.fn();
  return res;
}

describe("managedConfig — loadManagedConfig", () => {
  it("returns null when nothing is configured", () => {
    expect(loadManagedConfig({})).toBeNull();
  });

  it("parses inline JSON", () => {
    const cfg = loadManagedConfig({ OPENDOCBOT_MANAGED_CONFIG: '{"apiKey":"k"}' });
    expect(cfg).toEqual({ managedConfig: { apiKey: "k" } });
  });

  it("reads from a file when given a path", () => {
    const dir = mkdtempSync(join(tmpdir(), "odb-managed-"));
    const file = join(dir, "config.json");
    writeFileSync(file, '{"model":"m"}');
    const cfg = loadManagedConfig({ OPENDOCBOT_MANAGED_CONFIG_FILE: file });
    expect(cfg.managedConfig).toEqual({ model: "m" });
  });

  it("throws on malformed JSON", () => {
    expect(() => loadManagedConfig({ OPENDOCBOT_MANAGED_CONFIG: "{not json" })).toThrow(/valid JSON/);
  });

  it("throws when the file cannot be read", () => {
    expect(() =>
      loadManagedConfig({ OPENDOCBOT_MANAGED_CONFIG_FILE: "/nope/missing.json" })
    ).toThrow(/could not be read/);
  });

  it("throws when the config is not an object", () => {
    expect(() => loadManagedConfig({ OPENDOCBOT_MANAGED_CONFIG: "[1,2]" })).toThrow(/JSON object/);
  });
});

describe("managedConfig — handleAppConfig", () => {
  it("ignores non-app-config paths", () => {
    const res = makeRes();
    expect(handleAppConfig({ url: "/index.html" }, res, null)).toBe(false);
  });

  it("answers 404 when the instance is unmanaged", () => {
    const res = makeRes();
    const handled = handleAppConfig({ url: "/app-config.json" }, res, null);
    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.objectContaining({ "Content-Type": "application/json" }));
  });

  it("answers 200 with the payload and no-store when managed", () => {
    const res = makeRes();
    const cfg = { managedConfig: { apiKey: "k" } };
    handleAppConfig({ url: "/app-config.json?x=1" }, res, cfg);
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "application/json", "Cache-Control": "no-store" })
    );
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(cfg));
  });

  it("resolveManagedConfig returns the static config", () => {
    const cfg = { managedConfig: {} };
    expect(resolveManagedConfig({}, cfg)).toBe(cfg);
  });

  it("answers 401 when auth is enabled and there is no session", () => {
    const res = makeRes();
    const auth = { verifySession: () => null };
    handleAppConfig({ url: "/app-config.json" }, res, { managedConfig: {} }, auth);
    expect(res.writeHead).toHaveBeenCalledWith(
      401,
      expect.objectContaining({ "Content-Type": "application/json" })
    );
  });

  it("answers 200 when auth is enabled and the session is valid", () => {
    const res = makeRes();
    const auth = { verifySession: () => ({ sid: "s" }) };
    handleAppConfig({ url: "/app-config.json" }, res, { managedConfig: {} }, auth);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
  });
});

describe("managedConfig — injectManagedBootstrap", () => {
  const HTML = "<html><head><title>x</title></head><body></body></html>";

  it("injects a managed marker", () => {
    const out = injectManagedBootstrap(HTML, {});
    expect(out).toContain('<meta name="odb-managed" content=\'{"managed":true,"sso":false}\'>');
    expect(out.indexOf("odb-managed")).toBeLessThan(out.indexOf("</head>"));
  });

  it("injects the sso flag when auth is enabled", () => {
    const out = injectManagedBootstrap(HTML, {}, true);
    expect(out).toContain('content=\'{"managed":true,"sso":true}\'');
  });

  it("injects an sso-only marker (managed false) when there is no config", () => {
    const out = injectManagedBootstrap(HTML, null, true);
    expect(out).toContain('content=\'{"managed":false,"sso":true}\'');
  });

  it("does not inject when neither managed nor sso", () => {
    expect(injectManagedBootstrap(HTML, null)).not.toContain("odb-managed");
    expect(injectManagedBootstrap(HTML, null, false)).not.toContain("odb-managed");
  });

  it("strips a pre-existing marker (build leftovers)", () => {
    const stale = "<html><head><meta name=\"odb-managed\" content='{}'></head></html>";
    expect(injectManagedBootstrap(stale, null)).not.toContain("odb-managed");
  });

  it("replaces a pre-existing marker when managed", () => {
    const stale = "<html><head><meta name=\"odb-managed\" content='{\"managed\":true}'></head></html>";
    const out = injectManagedBootstrap(stale, {});
    expect(out.match(/odb-managed/g)?.length).toBe(1);
    expect(out).toContain('content=\'{"managed":true,"sso":false}\'');
  });
});

describe("managedConfig — SSO requirement", () => {
  it("defaults to requiring SSO", () => {
    expect(managedRequiresSso({})).toBe(true);
    expect(managedRequiresSso({ OPENDOCBOT_MANAGED_REQUIRE_SSO: "" })).toBe(true);
    expect(managedRequiresSso({ OPENDOCBOT_MANAGED_REQUIRE_SSO: "true" })).toBe(true);
  });

  it("can be disabled explicitly", () => {
    expect(managedRequiresSso({ OPENDOCBOT_MANAGED_REQUIRE_SSO: "false" })).toBe(false);
    expect(managedRequiresSso({ OPENDOCBOT_MANAGED_REQUIRE_SSO: "0" })).toBe(false);
  });

  it("throws when managed without auth and required", () => {
    expect(() =>
      assertManagedRequiresSso({ managed: true, authEnabled: false, requireSso: true })
    ).toThrow(/SSO is not configured/);
  });

  it("passes when auth is enabled, unmanaged, or not required", () => {
    expect(() =>
      assertManagedRequiresSso({ managed: true, authEnabled: true, requireSso: true })
    ).not.toThrow();
    expect(() =>
      assertManagedRequiresSso({ managed: false, authEnabled: false, requireSso: true })
    ).not.toThrow();
    expect(() =>
      assertManagedRequiresSso({ managed: true, authEnabled: false, requireSso: false })
    ).not.toThrow();
  });
});
