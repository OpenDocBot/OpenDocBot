import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  loadManagedConfig,
  parseManagedConfigResponse,
  managedConfigCacheKey,
  readManagedBootstrap,
  clearManagedConfigCache,
} from "../../lib/managedConfig";

const ORIGIN = "https://od.example.com";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
});

describe("parseManagedConfigResponse — validation", () => {
  it("keeps valid keys and drops unknown ones", () => {
    const payload = parseManagedConfigResponse({
      managedConfig: { apiKey: "k", baseUrl: "https://x", bogus: "nope" },
    });
    expect(payload.managedConfig.apiKey).toBe("k");
    expect(payload.managedConfig.baseUrl).toBe("https://x");
    expect(payload.managedConfig).not.toHaveProperty("bogus");
  });

  it("ignores wrong types, bad enums and out-of-range values", () => {
    const payload = parseManagedConfigResponse({
      managedConfig: {
        maxTokens: "lots",
        anthropicCacheTtl: "2h",
        maxIterations: 0,
        enableCache: "yes",
      },
    });
    expect(payload.managedConfig).toEqual({});
  });

  it("ignores prototype-polluting keys", () => {
    const payload = parseManagedConfigResponse({
      managedConfig: { ["__proto__"]: { polluted: true } },
    });
    expect(payload.managedConfig).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("tolerates a non-object body", () => {
    expect(parseManagedConfigResponse(null).managedConfig).toEqual({});
    expect(parseManagedConfigResponse("nope").managedConfig).toEqual({});
  });
});

describe("loadManagedConfig — fetch outcomes", () => {
  it("returns managed and caches on 200", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { managedConfig: { apiKey: "k" } })
    ) as unknown as typeof fetch;

    const result = await loadManagedConfig(fetchImpl, ORIGIN);
    expect(result.state).toBe("managed");
    if (result.state === "managed") {
      expect(result.payload.managedConfig.apiKey).toBe("k");
    }
    expect(localStorage.getItem(managedConfigCacheKey(ORIGIN))).not.toBeNull();
  });

  it("returns unmanaged on 404 without caching", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, {})) as unknown as typeof fetch;
    const result = await loadManagedConfig(fetchImpl, ORIGIN);
    expect(result.state).toBe("unmanaged");
    expect(localStorage.getItem(managedConfigCacheKey(ORIGIN))).toBeNull();
  });

  it("returns unavailable on a server error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;
    const result = await loadManagedConfig(fetchImpl, ORIGIN);
    expect(result.state).toBe("unavailable");
  });

  it("returns unavailable on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await loadManagedConfig(fetchImpl, ORIGIN);
    expect(result.state).toBe("unavailable");
  });

  it("falls back to a cached payload when the fetch fails", async () => {
    const good = vi.fn(async () =>
      jsonResponse(200, { managedConfig: { apiKey: "cached" } })
    ) as unknown as typeof fetch;
    await loadManagedConfig(good, ORIGIN);

    const bad = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await loadManagedConfig(bad, ORIGIN);
    expect(result.state).toBe("unavailable");
    if (result.state === "unavailable") {
      expect(result.payload?.managedConfig.apiKey).toBe("cached");
    }
  });

  it("ignores a cache written under an older schema version", async () => {
    localStorage.setItem(
      managedConfigCacheKey(ORIGIN),
      JSON.stringify({ schemaVersion: 0, savedAt: Date.now(), payload: { managedConfig: { apiKey: "old" } } })
    );
    const bad = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await loadManagedConfig(bad, ORIGIN);
    if (result.state === "unavailable") expect(result.payload).toBeNull();
  });
});

describe("readManagedBootstrap", () => {
  afterEach(() => {
    document.head.querySelectorAll("meta[name='odb-managed']").forEach((el) => el.remove());
  });

  it("reports unmanaged when the marker is absent", () => {
    expect(readManagedBootstrap()).toEqual({ managed: false, sso: false });
  });

  it("reports managed from the marker", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "odb-managed");
    meta.setAttribute("content", '{"managed":true}');
    document.head.appendChild(meta);
    expect(readManagedBootstrap()).toEqual({ managed: true, sso: false });
  });

  it("reads the sso flag from the marker", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "odb-managed");
    meta.setAttribute("content", '{"sso":true}');
    document.head.appendChild(meta);
    expect(readManagedBootstrap()).toEqual({ managed: true, sso: true });
  });

  it("treats a marker with malformed content as managed", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "odb-managed");
    meta.setAttribute("content", "not-json");
    document.head.appendChild(meta);
    expect(readManagedBootstrap()).toEqual({ managed: true, sso: false });
  });
});

describe("loadManagedConfig — timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts and returns unavailable when the request hangs", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const pending = loadManagedConfig(fetchImpl, ORIGIN, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.state).toBe("unavailable");
    if (result.state === "unavailable") expect(result.payload).toBeNull();
  });
});

describe("loadManagedConfig — auth", () => {
  it("sends the bearer token when provided", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { managedConfig: { apiKey: "k" } })
    ) as unknown as typeof fetch;

    await loadManagedConfig(fetchImpl, ORIGIN, { authToken: "sid-123" });
    const init = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sid-123");
  });

  it("returns unauthorized on 401", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: "nope" })) as unknown as typeof fetch;
    const result = await loadManagedConfig(fetchImpl, ORIGIN, { authToken: "bad" });
    expect(result.state).toBe("unauthorized");
  });
});

describe("loadManagedConfig — SSO does not persist", () => {
  function setSsoMarker() {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "odb-managed");
    meta.setAttribute("content", '{"sso":true}');
    document.head.appendChild(meta);
  }

  afterEach(() => {
    document.head.querySelectorAll("meta[name='odb-managed']").forEach((el) => el.remove());
  });

  it("does not cache the config on 200 when SSO is on", async () => {
    setSsoMarker();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { managedConfig: { apiKey: "secret" } })
    ) as unknown as typeof fetch;

    const result = await loadManagedConfig(fetchImpl, ORIGIN);

    expect(result.state).toBe("managed");
    expect(localStorage.getItem(managedConfigCacheKey(ORIGIN))).toBeNull();
  });

  it("ignores a cached copy on failure when SSO is on", async () => {
    setSsoMarker();
    localStorage.setItem(
      managedConfigCacheKey(ORIGIN),
      JSON.stringify({ schemaVersion: 1, savedAt: Date.now(), payload: { managedConfig: { apiKey: "stale" } } })
    );
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await loadManagedConfig(fetchImpl, ORIGIN);

    expect(result.state).toBe("unavailable");
    if (result.state === "unavailable") expect(result.payload).toBeNull();
  });

  it("clearManagedConfigCache removes the cached copy", () => {
    localStorage.setItem(managedConfigCacheKey(ORIGIN), "x");
    clearManagedConfigCache(ORIGIN);
    expect(localStorage.getItem(managedConfigCacheKey(ORIGIN))).toBeNull();
  });
});
