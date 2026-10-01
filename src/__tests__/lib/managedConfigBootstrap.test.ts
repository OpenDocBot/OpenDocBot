import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initManagedConfig, refreshManagedConfig } from "../../lib/managedConfigBootstrap";
import { useManagedConfigStore } from "../../store/managedConfigStore";
import { useAuthStore } from "../../store/authStore";

function setMarker(content: string | null) {
  document.head.querySelectorAll("meta[name='odb-managed']").forEach((el) => el.remove());
  if (content === null) return;
  const meta = document.createElement("meta");
  meta.setAttribute("name", "odb-managed");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

beforeEach(() => {
  localStorage.clear();
  useManagedConfigStore.setState({
    state: "loading",
    payload: null,
    managedInstance: false,
  });
  setMarker(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initManagedConfig — bootstrap gate", () => {
  it("does not fetch and stays unmanaged when the marker is absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useManagedConfigStore.getState().state).toBe("unmanaged");
    expect(useManagedConfigStore.getState().managedInstance).toBe(false);
  });

  it("records managedInstance from the marker", async () => {
    setMarker("{}");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ managedConfig: {} }),
      }))
    );

    await initManagedConfig();

    expect(useManagedConfigStore.getState().managedInstance).toBe(true);
  });

  it("fetches and applies the config when the marker is present", async () => {
    setMarker("{}");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ managedConfig: { apiKey: "managed-key" } }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const store = useManagedConfigStore.getState();
    expect(store.state).toBe("managed");
    expect(store.payload?.managedConfig.apiKey).toBe("managed-key");
  });

  it("falls back to unavailable when the fetch fails with no cache", async () => {
    setMarker("{}");
    const fetchSpy = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    const store = useManagedConfigStore.getState();
    expect(store.state).toBe("unavailable");
    expect(store.payload).toBeNull();
    expect(store.managedInstance).toBe(true);
  });
});

describe("initManagedConfig — SSO gate", () => {
  const SID_KEY = "opendocbot-session-id";

  beforeEach(() => {
    useAuthStore.setState({ status: "notRequired", sid: null, user: null });
  });

  it("shows the gate and makes no config request when SSO is on and there is no session", async () => {
    setMarker('{"sso":true}');
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("signs in from a stored session and loads the config", async () => {
    setMarker('{"sso":true}');
    localStorage.setItem(SID_KEY, "sid-abc");
    const fetchSpy = vi.fn(async (url: unknown) => {
      if (String(url) === "/auth/session") {
        return { ok: true, status: 200, json: async () => ({ user: { sub: "u1", email: "u@x" } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ managedConfig: { apiKey: "managed" } }),
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useManagedConfigStore.getState().state).toBe("managed");
  });

  it("drops the session and shows the gate when it is rejected", async () => {
    setMarker('{"sso":true}');
    localStorage.setItem(SID_KEY, "stale");
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(localStorage.getItem(SID_KEY)).toBeNull();
  });

  it("gates on an sso-only marker but never probes the config endpoint", async () => {
    setMarker('{"managed":false,"sso":true}');
    localStorage.setItem(SID_KEY, "sid-abc");
    const fetchSpy = vi.fn(async (url: unknown) => {
      if (String(url) === "/auth/session") {
        return { ok: true, status: 200, json: async () => ({ user: { sub: "u1" } }) };
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useManagedConfigStore.getState().state).toBe("unmanaged");
    const called = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(called).not.toContain("/app-config.json");
  });

  it("keeps the stored session when the server is unreachable after a retry", async () => {
    setMarker('{"sso":true}');
    localStorage.setItem(SID_KEY, "sid-offline");
    const fetchSpy = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    await initManagedConfig();

    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(localStorage.getItem(SID_KEY)).toBe("sid-offline");
    // Retried once (two attempts).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("refreshManagedConfig", () => {
  it("returns managed on success", async () => {
    setMarker('{}');
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ managedConfig: { apiKey: "new" } }),
      }))
    );

    const outcome = await refreshManagedConfig();

    expect(outcome).toBe("managed");
    expect(useManagedConfigStore.getState().payload?.managedConfig).toEqual({ apiKey: "new" });
  });

  it("returns unavailable and keeps the last payload when the server fails", async () => {
    setMarker('{}');
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "old" } },
      managedInstance: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );

    const outcome = await refreshManagedConfig();

    expect(outcome).toBe("unavailable");
    const s = useManagedConfigStore.getState();
    expect(s.payload?.managedConfig).toEqual({ apiKey: "old" });
    expect(s.state).toBe("managed");
  });
});
