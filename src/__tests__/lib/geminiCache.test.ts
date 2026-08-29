import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiCache, DEFAULT_RECACHE_THRESHOLD, CACHE_TTL_MS } from "../../lib/geminiCache";

type CacheContents = Array<{ role: string; parts: Array<Record<string, unknown>> }>;

const contents: CacheContents = [{ role: "user", parts: [{ text: "hello" }] }];

function mockCreateCacheSuccess(expireTime?: string) {
  const expire = expireTime ?? new Date(Date.now() + CACHE_TTL_MS).toISOString();
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      name: "cachedContents/test",
      model: "models/gemini-x",
      createTime: "",
      updateTime: "",
      expireTime: expire,
    }),
  } as Response);
}

describe("GeminiCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rebuilds when the estimated delta crosses the threshold", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    cache.setRecacheThreshold(8000);
    await cache.createOrUpdateCache("m", null, contents, null, 1000);

    expect(cache.shouldRecreateCache(1000 + 8000)).toBe(true);
    expect(cache.shouldRecreateCache(1000 + 8000 - 1)).toBe(false);
  });

  it("uses DEFAULT_RECACHE_THRESHOLD when no threshold is set", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    await cache.createOrUpdateCache("m", null, contents, null, 500);

    expect(cache.shouldRecreateCache(500 + DEFAULT_RECACHE_THRESHOLD)).toBe(true);
  });

  it("clamps threshold to a minimum of 1024 tokens", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    cache.setRecacheThreshold(1);
    await cache.createOrUpdateCache("m", null, contents, null, 0);

    expect(cache.shouldRecreateCache(1024)).toBe(true);
    expect(cache.shouldRecreateCache(1023)).toBe(false);
  });

  it("reports expired caches", async () => {
    mockCreateCacheSuccess(new Date(Date.now() - 1000).toISOString());
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    await cache.createOrUpdateCache("m", null, contents, null, 100);

    expect(cache.isExpired()).toBe(true);
  });

  it("does not report expiry or rebuild without a live cache", () => {
    const cache = new GeminiCache();
    expect(cache.isExpired()).toBe(false);
    expect(cache.shouldRecreateCache(99999)).toBe(false);
  });

  it("invalidate clears cache state", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    await cache.createOrUpdateCache("m", null, contents, null, 100);

    expect(cache.getCacheId()).toBe("cachedContents/test");
    cache.invalidate();
    expect(cache.getCacheId()).toBeNull();
    expect(cache.isExpired()).toBe(false);
    expect(cache.shouldRecreateCache(5000)).toBe(false);
  });

  it("clears state when cache creation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("content too small"),
    } as Response);
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    const result = await cache.createOrUpdateCache("m", null, contents, null, 100);

    expect(result).toBeNull();
    expect(cache.getCacheId()).toBeNull();
    expect(cache.isExpired()).toBe(false);
  });

  it("flushRemote deletes the remote cache with keepalive", async () => {
    const calls: Array<{ url: string; method?: string; keepalive?: boolean }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, keepalive: init?.keepalive });
      if (String(input).includes("cachedContents") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            name: "cachedContents/c1",
            model: "models/gemini-x",
            createTime: "",
            updateTime: "",
            expireTime: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
          }),
        } as Response;
      }
      return { ok: true, status: 200 } as Response;
    });

    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    await cache.createOrUpdateCache("m", null, contents, null, 100);
    cache.flushRemote();

    const deleteCall = calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.url).toBe("https://api.example/cachedContents/c1");
    expect(deleteCall?.keepalive).toBe(true);
  });

  it("stores a fingerprint of systemInstruction + tools on creation", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    const sys = { parts: [{ text: "You are helpful." }] };
    const tools = [{ functionDeclarations: [{ name: "t" }] }];
    await cache.createOrUpdateCache("m", sys, contents, tools, 100);

    expect(cache.getSystemFingerprint()).toBe(JSON.stringify({ systemInstruction: sys, tools }));
  });

  it("clears the fingerprint on invalidate and reset", async () => {
    mockCreateCacheSuccess();
    const cache = new GeminiCache();
    cache.setConfig("key", "https://api.example");
    await cache.createOrUpdateCache("m", { parts: [{ text: "x" }] }, contents, null, 100);
    expect(cache.getSystemFingerprint()).not.toBeNull();

    cache.invalidate();
    expect(cache.getSystemFingerprint()).toBeNull();

    await cache.createOrUpdateCache("m", { parts: [{ text: "x" }] }, contents, null, 100);
    cache.reset();
    expect(cache.getSystemFingerprint()).toBeNull();
  });

  it("produces different fingerprints for different system prompts", async () => {
    mockCreateCacheSuccess();
    const a = new GeminiCache();
    a.setConfig("key", "https://api.example");
    await a.createOrUpdateCache("m", { parts: [{ text: "instructions A" }] }, contents, null, 100);
    const b = new GeminiCache();
    b.setConfig("key", "https://api.example");
    await b.createOrUpdateCache("m", { parts: [{ text: "instructions B" }] }, contents, null, 100);

    expect(a.getSystemFingerprint()).not.toBe(b.getSystemFingerprint());
  });
});
