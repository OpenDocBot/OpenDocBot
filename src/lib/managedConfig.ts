import { normalizeImportedConfig } from "./configExport";
import { CURRENT_CONFIG_VERSION } from "../store/migrations";
import type { ProviderConfig } from "../store/settingsStore";
import { debugLog } from "./debugLog";

/** Same-origin endpoint served by scripts/serve.mjs on self-hosted instances. */
const APP_CONFIG_PATH = "/app-config.json";

/**
 * Name of the bootstrap <meta> the server injects into index.html. Its presence
 * means the deployment is managed, so the client fetches the endpoint; absent
 * means regular mode with no request at all. Must match
 * `BOOTSTRAP_META_NAME` in scripts/managedConfig.mjs (the client cannot import
 * that module).
 */
const BOOTSTRAP_META_NAME = "odb-managed";

/** How long the startup fetch may take before it is aborted. */
export const MANAGED_CONFIG_TIMEOUT_MS = 5000;

/**
 * Client for the self-hosted managed-config endpoint (see
 * docs/enterprise/managed-configuration). An instance may force a subset of the
 * config: any key present is forced, any key absent falls back to the user's
 * local value. The endpoint is same-origin and returns 404 when the instance is
 * not managed, so the client must not treat a failure as "managed with HTML".
 */

/** Validated, forced-only config. */
export interface ManagedConfigPayload {
  /** Only the validated forced keys (Partial<ProviderConfig>). */
  managedConfig: Partial<ProviderConfig>;
}

const CACHE_PREFIX = "opendocbot-managed-config:";

interface CachedManagedConfig {
  schemaVersion: number;
  savedAt: number;
  payload: ManagedConfigPayload;
}

export function managedConfigCacheKey(origin: string): string {
  return `${CACHE_PREFIX}${origin}`;
}

function readCache(origin: string): ManagedConfigPayload | null {
  try {
    const raw = localStorage.getItem(managedConfigCacheKey(origin));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedManagedConfig;
    if (!parsed || typeof parsed !== "object") return null;
    // Ignore a cache written under an older schema: the shape may differ.
    if (parsed.schemaVersion !== CURRENT_CONFIG_VERSION) return null;
    if (!parsed.payload || typeof parsed.payload !== "object") return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCache(origin: string, payload: ManagedConfigPayload): void {
  try {
    const entry: CachedManagedConfig = {
      schemaVersion: CURRENT_CONFIG_VERSION,
      savedAt: Date.now(),
      payload,
    };
    localStorage.setItem(managedConfigCacheKey(origin), JSON.stringify(entry));
  } catch {
    // Cache is best-effort; ignore quota/disabled-storage errors.
  }
}

/** Remove the cached managed config (used on sign-out/session loss). */
export function clearManagedConfigCache(origin: string = location.origin): void {
  try {
    localStorage.removeItem(managedConfigCacheKey(origin));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Validate a raw `/app-config.json` body into a payload. Unknown keys are
 * dropped, wrong types ignored, enums/ranges enforced (via the same validation
 * used by config import). Never throws.
 */
export function parseManagedConfigResponse(raw: unknown): ManagedConfigPayload {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { managedConfig: {} };
  }
  const body = raw as Record<string, unknown>;
  const managedConfig = normalizeImportedConfig(body.managedConfig);
  return { managedConfig };
}

export type ManagedConfigLoad =
  | { state: "managed"; payload: ManagedConfigPayload }
  | { state: "unmanaged" }
  | { state: "unauthorized" }
  | { state: "unavailable"; payload: ManagedConfigPayload | null };

/** The server-injected bootstrap marker for this page. */
export interface ManagedBootstrap {
  /** True when a managed config exists, so the client fetches the endpoint. */
  managed: boolean;
  /** True when the instance requires a sign-in session. */
  sso: boolean;
}

/**
 * Read the server-injected bootstrap marker. Absence of the meta means regular
 * mode (no request, no gate). A present marker separates `managed` (fetch the
 * config) from `sso` (require a session): a marker without `managed` still
 * gates on sign-in but never probes the config endpoint. A marker predating the
 * `managed` field, or with malformed content, still counts as managed.
 */
export function readManagedBootstrap(doc: Document = document): ManagedBootstrap {
  const el = doc.querySelector(`meta[name="${BOOTSTRAP_META_NAME}"]`);
  if (!el) return { managed: false, sso: false };
  const raw = el.getAttribute("content") ?? "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const marker = parsed as { managed?: unknown; sso?: unknown };
      return {
        // Default to managed: legacy markers carry no `managed` field.
        managed: marker.managed !== false,
        sso: marker.sso === true,
      };
    }
  } catch {
    /* malformed marker: still managed */
  }
  return { managed: true, sso: false };
}

export interface LoadManagedConfigOptions {
  timeoutMs?: number;
  /** Session id to send as `Authorization: Bearer`. */
  authToken?: string | null;
}

/**
 * Fetch the instance's managed config.
 *  - 200: managed (validated) and cached.
 *  - 401: authentication required/rejected -> `unauthorized`.
 *  - 404: unmanaged (local mode).
 *  - anything else / error / timeout: `unavailable`; callers fall back to the
 *    cache. Never logs secrets.
 */
export async function loadManagedConfig(
  fetchImpl: typeof fetch = fetch,
  origin: string = location.origin,
  options: LoadManagedConfigOptions = {},
): Promise<ManagedConfigLoad> {
  const timeoutMs = options.timeoutMs ?? MANAGED_CONFIG_TIMEOUT_MS;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;

  // On SSO instances the config may contain credentials: never persist it, and
  // never fall back to a cached copy (it could outlive the session).
  const sso = readManagedBootstrap().sso;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(APP_CONFIG_PATH, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 401) return { state: "unauthorized" };
    if (res.status === 404) return { state: "unmanaged" };
    if (!res.ok) {
      debugLog("info", `Managed config request failed: HTTP ${res.status}`);
      return { state: "unavailable", payload: sso ? null : readCache(origin) };
    }
    const body = (await res.json()) as unknown;
    const payload = parseManagedConfigResponse(body);
    if (!sso) writeCache(origin, payload);
    return { state: "managed", payload };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? "timed out" : (err as Error).message;
    debugLog("info", `Managed config request errored: ${reason}`);
    return { state: "unavailable", payload: sso ? null : readCache(origin) };
  } finally {
    clearTimeout(timer);
  }
}
