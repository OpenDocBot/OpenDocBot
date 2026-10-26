// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Sandbox, ensureSandboxReady } from "../../lib/sandbox";

describe("Sandbox", () => {
  it("does not expose host globals", async () => {
    const sandbox = new Sandbox();
    const result = await sandbox.run(
      "return { window: typeof window, fetch: typeof fetch, process: typeof process, document: typeof document };",
      "ctx",
      {},
    );
    expect(result).toEqual({
      window: "undefined",
      fetch: "undefined",
      process: "undefined",
      document: "undefined",
    });
    // localStorage is rejected outright by the source filter, which is stronger
    // than only hiding it.
    await expect(sandbox.run("return typeof localStorage;", "ctx", {})).rejects.toThrow(
      /blocked/i,
    );
  });

  it("blocks internal and dangerous properties on the context", async () => {
    const sandbox = new Sandbox();
    const context = { _secret: "x", ok: true };
    await expect(sandbox.run("return ctx._secret;", "ctx", context)).rejects.toThrow(
      /IllegalAccess/,
    );
    await expect(sandbox.run("return ctx.constructor;", "ctx", context)).rejects.toThrow(
      /blocked|IllegalAccess/i,
    );
    await expect(sandbox.run("return ctx.__proto__;", "ctx", context)).rejects.toThrow(
      /blocked|IllegalAccess/i,
    );
    await expect(sandbox.run("return ctx.ok;", "ctx", context)).resolves.toBe(true);
  });

  it("blocks internals on nested objects", async () => {
    const sandbox = new Sandbox();
    const context = { document: { _internal: 1, visible: 2 } };
    await expect(sandbox.run("return ctx.document._internal;", "ctx", context)).rejects.toThrow(
      /IllegalAccess/,
    );
    await expect(sandbox.run("return ctx.document.visible;", "ctx", context)).resolves.toBe(2);
  });

  it("unwraps `this` for host methods", async () => {
    const sandbox = new Sandbox();
    const context = {
      value: 7,
      getValue() {
        return this.value;
      },
    };
    await expect(sandbox.run("return ctx.getValue();", "ctx", context)).resolves.toBe(7);
  });

  it("exposes wrapped endowments", async () => {
    const sandbox = new Sandbox({ globals: { helper: { double: (n: number) => n * 2 } } });
    await expect(sandbox.run("return helper.double(21);", "ctx", {})).resolves.toBe(42);
  });

  it("preserves Office.js function statics (no SES lockdown)", () => {
    const fn = Function as unknown as { _validateParams?: () => string };
    fn._validateParams = () => "ok";
    new Sandbox();
    expect(typeof fn._validateParams).toBe("function");
  });

  it("rejects constructor escape and network primitives", async () => {
    const sandbox = new Sandbox();
    const blocked = [
      'return ({}).constructor.constructor("return typeof fetch")();',
      'return fetch("https://example.com");',
      'return localStorage.getItem("x");',
      "return globalThis;",
      "return new Function('return 1')();",
    ];
    for (const code of blocked) {
      await expect(sandbox.run(code, "ctx", {})).rejects.toThrow(/blocked/i);
    }
  });

  it("allows ordinary text that mentions window/document", async () => {
    const sandbox = new Sandbox();
    await expect(
      sandbox.run('return "the window and the document";', "ctx", {}),
    ).resolves.toBe("the window and the document");
  });

  it("is safe to initialise repeatedly", () => {
    expect(() => ensureSandboxReady()).not.toThrow();
    expect(() => ensureSandboxReady()).not.toThrow();
  });
});
