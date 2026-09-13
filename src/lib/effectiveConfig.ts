import type { ProviderConfig } from "../store/settingsStore";
import { getPreset, matchPreset } from "../components/settings/PresetSelector";

/**
 * Where the active configuration comes from. Today every install is "local"
 * (the user's browser localStorage). A future IT-managed deployment can supply
 * a "managed" config (e.g. via manifest parameters or a bootstrap endpoint, in
 * the style of Claude for M365) that overrides the local one. UI only ever
 * reads through `getEffectiveConfig()` so nothing else needs to change.
 */
export type ConfigSource = "local" | "managed";

/** Resolve the preset the current config points at (presetId wins over URL matching). */
export function getPresetInfo(config: ProviderConfig) {
  const presetId =
    config.presetId && getPreset(config.presetId)
      ? config.presetId
      : matchPreset(config.baseUrl, config.model);
  return { presetId, preset: getPreset(presetId) };
}

/**
 * Whether the active config can actually make a request. Uses the *preset's*
 * `requiresKey` (not the provider's — OpenAI-compatible providers are
 * registered with `requiresKey: false`, which would let an empty key through).
 */
export function isConfigured(config: ProviderConfig): boolean {
  const { preset } = getPresetInfo(config);
  const requiresKey = preset?.requiresKey ?? true;
  if (requiresKey && !config.apiKey) return false;
  // Custom endpoints only need a base URL — the model is resolved at request
  // time (some gateways don't require an explicit model name).
  if (preset?.id === "custom") return Boolean(config.baseUrl);
  if (!config.model) return false;
  return true;
}

/**
 * The effective configuration governing the UI. Today it just returns the
 * local config; the seam exists so a future managed config can override it.
 */
export function getEffectiveConfig(config: ProviderConfig): ProviderConfig {
  return config;
}

export function getConfigSource(): ConfigSource {
  return "local";
}