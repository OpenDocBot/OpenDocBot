import { APP_VERSION } from "./buildInfo";
import {
  decryptConfig,
  encryptConfig,
  type Argon2Params,
  type ConfigEnvelope,
} from "./configCrypto";
import { CURRENT_CONFIG_VERSION, migrateConfig } from "../store/migrations";
import { DEFAULT_PROVIDER_CONFIG, type ProviderConfig } from "../store/settingsStore";

/**
 * Config-domain layer for encrypted export/import. Kept separate from
 * `configCrypto` so the crypto stays generic and this module owns the shape of
 * `ProviderConfig`: which keys are exported, how an imported bundle is
 * validated, and how it is turned back into a complete config.
 */

/**
 * Keys omitted from an export by default (in addition to secrets, which are
 * included by default). Overridable at build time with the comma-separated
 * `VITE_CONFIG_EXPORT_EXCLUDE` environment variable.
 */
export const EXPORT_EXCLUDED_KEYS: string[] = [];

/** Keys considered secret for the UI's optional "omit secrets" toggle. */
export const SECRET_KEYS: string[] = ["apiKey", "customHeaders"];

/** Effective export exclusion list: built-in defaults plus the env override. */
export function getExportExcludedKeys(): string[] {
  const raw = import.meta.env.VITE_CONFIG_EXPORT_EXCLUDE;
  const fromEnv = typeof raw === "string" ? raw.split(",") : [];
  const all = [...EXPORT_EXCLUDED_KEYS, ...fromEnv]
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  return [...new Set(all)];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Build the exported payload: the whole config, minus excluded keys, with
 * `customHeaders` deep-cloned so later mutations can't leak back into the store.
 * Because the entire object is copied, config fields added in future versions
 * are exported automatically.
 */
export function pickExportableConfig(
  config: ProviderConfig,
  excluded: readonly string[] = getExportExcludedKeys(),
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(config) as (keyof ProviderConfig)[]) {
    if (excluded.includes(key)) continue;
    const value = config[key];
    if (value === undefined) continue;
    out[key] = key === "customHeaders" && isPlainObject(value) ? { ...value } : value;
  }
  return out;
}

/** Keep only string-valued, non-unsafe custom headers. */
function normalizeCustomHeaders(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (typeof headerValue !== "string") continue;
    out[key] = headerValue;
  }
  return out;
}

/**
 * Validate and normalize an imported payload. Unknown keys are dropped, fields
 * of the wrong type are ignored (they fall back to defaults), and enums/ranges
 * are enforced. Never throws; a completely invalid payload yields `{}`.
 */
export function normalizeImportedConfig(raw: unknown): Partial<ProviderConfig> {
  if (!isPlainObject(raw)) return {};
  const out: Partial<ProviderConfig> = {};

  if (typeof raw.presetId === "string") out.presetId = raw.presetId;
  if (typeof raw.providerId === "string") out.providerId = raw.providerId;
  if (typeof raw.apiKey === "string") out.apiKey = raw.apiKey;
  if (typeof raw.model === "string") out.model = raw.model;
  if (typeof raw.baseUrl === "string") out.baseUrl = raw.baseUrl;
  if (typeof raw.reasoningEffort === "string") out.reasoningEffort = raw.reasoningEffort;
  if (typeof raw.bedrockRegion === "string") out.bedrockRegion = raw.bedrockRegion;
  if (typeof raw.ocrLanguage === "string") out.ocrLanguage = raw.ocrLanguage;
  if (typeof raw.customInstructions === "string") out.customInstructions = raw.customInstructions;

  if (typeof raw.enableCache === "boolean") out.enableCache = raw.enableCache;
  if (typeof raw.useLegacyChatCompletions === "boolean") {
    out.useLegacyChatCompletions = raw.useLegacyChatCompletions;
  }
  if (typeof raw.proxyRequests === "boolean") out.proxyRequests = raw.proxyRequests;
  if (typeof raw.humanInTheLoop === "boolean") out.humanInTheLoop = raw.humanInTheLoop;
  if (typeof raw.suggestionMode === "boolean") out.suggestionMode = raw.suggestionMode;

  if (isIntInRange(raw.maxTokens, 1, 10_000_000)) out.maxTokens = raw.maxTokens;
  if (isIntInRange(raw.recacheThreshold, 0, 10_000_000)) out.recacheThreshold = raw.recacheThreshold;
  if (isIntInRange(raw.maxIterations, 1, 1_000_000)) out.maxIterations = raw.maxIterations;

  if (raw.anthropicCacheTtl === "5m" || raw.anthropicCacheTtl === "1h") {
    out.anthropicCacheTtl = raw.anthropicCacheTtl;
  }
  if (raw.openRouterRegion === "global" || raw.openRouterRegion === "eu" || raw.openRouterRegion === "us") {
    out.openRouterRegion = raw.openRouterRegion;
  }

  const headers = normalizeCustomHeaders(raw.customHeaders);
  if (headers !== undefined) out.customHeaders = headers;

  return out;
}

/**
 * Turn a decrypted payload into a complete config: migrate from the blob's
 * schema version, normalize, then apply over defaults (replace-all semantics,
 * so keys missing from the blob fall back to defaults).
 */
export function buildConfigFromImport(imported: unknown, fromSchemaVersion: number): ProviderConfig {
  const migrated = migrateConfig(imported, fromSchemaVersion);
  const normalized = normalizeImportedConfig(migrated);
  return {
    ...DEFAULT_PROVIDER_CONFIG,
    ...normalized,
    customHeaders: normalized.customHeaders ? { ...normalized.customHeaders } : {},
  };
}

export interface ExportOptions {
  excludedKeys?: readonly string[];
  kdfParams?: Argon2Params;
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
}

/** Encrypt the local config into a shareable `ODB1.` blob (fully client-side). */
export async function exportConfigBlob(
  config: ProviderConfig,
  passphrase: string,
  options: ExportOptions = {},
): Promise<string> {
  const payload = pickExportableConfig(config, options.excludedKeys ?? getExportExcludedKeys());
  return encryptConfig(payload, passphrase, {
    kdfParams: options.kdfParams,
    schemaVersion: options.schemaVersion ?? CURRENT_CONFIG_VERSION,
    appVersion: options.appVersion ?? APP_VERSION,
    createdAt: options.createdAt,
  });
}

export interface ImportResult {
  config: ProviderConfig;
  envelope: ConfigEnvelope;
}

/** Decrypt an `ODB1.` blob and rebuild a complete config (replace-all). */
export async function importConfigBlob(blob: string, passphrase: string): Promise<ImportResult> {
  const { payload, envelope } = await decryptConfig(blob, passphrase);
  return { config: buildConfigFromImport(payload, envelope.schemaVersion), envelope };
}
