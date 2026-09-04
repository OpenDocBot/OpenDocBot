import { describe, it, expect, beforeEach } from "vitest";
import { resolveCustomHeaders, withCustomHeaders } from "../../lib/customHeaders";
import { resetSessionId } from "../../lib/chatSession";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
  resetSessionId();
});

describe("resolveCustomHeaders", () => {
  it("returns empty for undefined or empty input", () => {
    expect(resolveCustomHeaders(undefined)).toEqual({});
    expect(resolveCustomHeaders({})).toEqual({});
  });

  it("resolves model, baseUrl and host variables", () => {
    const out = resolveCustomHeaders(
      {
        "x-model": "$MODEL",
        "x-base": "$BASE_URL",
        "x-host": "$HOST",
        "x-version": "$VERSION",
      },
      { model: "qwen3.8-max", baseUrl: "https://opencode.ai/zen/go/v1" }
    );
    expect(out["x-model"]).toBe("qwen3.8-max");
    expect(out["x-base"]).toBe("https://opencode.ai/zen/go/v1");
    expect(out["x-host"]).toBe("word");
    expect(out["x-version"]).not.toBe("");
  });

  it("resolves $SESSION_ID to a stable uuid across calls", () => {
    const a = resolveCustomHeaders({ "x-session": "$SESSION_ID" })["x-session"];
    const b = resolveCustomHeaders({ "x-session": "$SESSION_ID" })["x-session"];
    expect(a).toMatch(UUID_RE);
    expect(a).toBe(b);
  });

  it("resolves $RANDOM to a fresh uuid per call", () => {
    const a = resolveCustomHeaders({ "x": "$RANDOM" })["x"];
    const b = resolveCustomHeaders({ "x": "$RANDOM" })["x"];
    expect(a).toMatch(UUID_RE);
    expect(a).not.toBe(b);
  });

  it("resolves $TIMESTAMP to unix milliseconds", () => {
    const ts = resolveCustomHeaders({ "x": "$TIMESTAMP" })["x"];
    expect(ts).toMatch(/^\d+$/);
  });

  it("leaves unknown variables untouched", () => {
    const out = resolveCustomHeaders({ "x": "$FOO" });
    expect(out["x"]).toBe("$FOO");
  });

  it("resolves a variable embedded in the middle of a value", () => {
    const out = resolveCustomHeaders(
      { "x-session": "prefix-$SESSION_ID-suffix" },
      { model: "m", baseUrl: "u" }
    );
    expect(out["x-session"]).toMatch(/^prefix-[0-9a-f-]{36}-suffix$/);
  });

  it("resolves multiple variables in a single value", () => {
    const out = resolveCustomHeaders(
      { "x-meta": "$MODEL/$BASE_URL" },
      { model: "qwen3.8-max", baseUrl: "https://opencode.ai/zen/go/v1" }
    );
    expect(out["x-meta"]).toBe("qwen3.8-max/https://opencode.ai/zen/go/v1");
  });

  it("resolves a repeated token in a single value", () => {
    const out = resolveCustomHeaders({ "x": "$SESSION_ID-$SESSION_ID" });
    expect(out["x"]).toMatch(/^[0-9a-f-]{36}-[0-9a-f-]{36}$/);
  });

  it("leaves $ followed by a non-identifier (e.g. $5) untouched", () => {
    const out = resolveCustomHeaders({ "x": "cost: $5 and $home" });
    expect(out["x"]).toBe("cost: $5 and $home");
  });

  it("does not resolve lowercase variables", () => {
    const out = resolveCustomHeaders({ "x": "$session_id" });
    expect(out["x"]).toBe("$session_id");
  });

  it("drops a header whose value resolves to empty", () => {
    const out = resolveCustomHeaders({ "x": "$BASE_URL" });
    expect(out["x"]).toBeUndefined();
    expect(out).toEqual({});
  });

  it("drops headers with invalid names", () => {
    const out = resolveCustomHeaders({
      "bad name": "v",
      "x:y": "v",
      "x-app": "ok",
    });
    expect(out["bad name"]).toBeUndefined();
    expect(out["x:y"]).toBeUndefined();
    expect(out["x-app"]).toBe("ok");
  });

  it("trims header names", () => {
    const out = resolveCustomHeaders({ "  x-app  ": "ok" });
    expect(out["x-app"]).toBe("ok");
    expect(out["  x-app  "]).toBeUndefined();
  });

  it("drops empty keys and empty values", () => {
    expect(resolveCustomHeaders({ "": "value", "empty": "" })).toEqual({});
  });

  it("keeps literal values", () => {
    const out = resolveCustomHeaders({ "x-tenant": "acme" });
    expect(out["x-tenant"]).toBe("acme");
  });
});

describe("withCustomHeaders", () => {
  it("provider headers win over custom headers on collision", () => {
    const out = withCustomHeaders(
      { Authorization: "Bearer sk-test", "x-app": "provider" },
      { "x-app": "user", "x-user": "$SESSION_ID" }
    );
    expect(out.Authorization).toBe("Bearer sk-test");
    expect(out["x-app"]).toBe("provider");
    expect(out["x-user"]).toMatch(UUID_RE);
  });
});