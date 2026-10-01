import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sessionAuthHeaders, proxyFetch, SESSION_HEADER } from "../../lib/sessionAuth";

const SID_KEY = "opendocbot-session-id";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sessionAuthHeaders", () => {
  it("returns no header without a stored session", () => {
    expect(sessionAuthHeaders("/proxy/https%3A%2F%2Fapi.example.com/v1")).toEqual({});
  });

  it("returns the session header for a /proxy/ URL", () => {
    localStorage.setItem(SID_KEY, "sid-1");
    expect(sessionAuthHeaders("/proxy/https%3A%2F%2Fapi.example.com/v1")).toEqual({
      [SESSION_HEADER]: "sid-1",
    });
  });

  it("ignores non-proxy URLs", () => {
    localStorage.setItem(SID_KEY, "sid-1");
    expect(sessionAuthHeaders("https://api.example.com/v1")).toEqual({});
  });
});

describe("proxyFetch", () => {
  it("adds the session header to proxied requests, preserving other headers", async () => {
    localStorage.setItem(SID_KEY, "sid-1");
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await proxyFetch("/proxy/https%3A%2F%2Fapi.example.com/v1/models", {
      headers: { Authorization: "Bearer provider-key" },
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get(SESSION_HEADER)).toBe("sid-1");
    expect(headers.get("Authorization")).toBe("Bearer provider-key");
  });

  it("passes through non-proxy requests untouched", async () => {
    localStorage.setItem(SID_KEY, "sid-1");
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await proxyFetch("https://api.example.com/v1/models");

    expect(fetchSpy.mock.calls[0][1]).toBeUndefined();
  });
});
