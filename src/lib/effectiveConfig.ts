import { useMemo } from "react";
import type { ProviderConfig } from "../store/settingsStore";
import { useSettingsStore } from "../store/settingsStore";
import { useManagedConfigStore } from "../store/managedConfigStore";
import { getPreset, matchPreset } from "../components/settings/PresetSelector";

/**
 * Where the active configuration comes from. Today every install is "local"
 * (the user's browser localStorage). A self-hosted deployment can supply a
 * "managed" config (see docs/enterprise/managed-configuration) that forces a subset
 * of keys. UI only ever reads through `useEffectiveConfig()`, and only forced
 * keys behave differently.
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
 * The keys forced by the managed config (present = forced). Empty for local
 * installs. Used by Settings to disable the fields a user cannot change.
 */
export function getForcedKeys(managed: Partial<ProviderConfig> | null): (keyof ProviderConfig)[] {
  if (!managed) return [];
  return Object.keys(managed) as (keyof ProviderConfig)[];
}

/**
 * Merge the managed (forced) layer over the local config: any key present in
 * `managed` wins; any key absent keeps the local value.
 */
export function getEffectiveConfig(
  config: ProviderConfig,
  managed: Partial<ProviderConfig> | null = null,
): ProviderConfig {
  if (!managed) return config;
  return { ...config, ...managed };
}

/** The effective config, reacting to both local and managed changes. */
export function useEffectiveConfig(): ProviderConfig {
  const local = useSettingsStore((s) => s.config);
  const managed = useManagedConfigStore((s) => s.payload?.managedConfig ?? null);
  return useMemo(() => getEffectiveConfig(local, managed), [local, managed]);
}

export function getConfigSource(managed: Partial<ProviderConfig> | null = null): ConfigSource {
  return managed && Object.keys(managed).length > 0 ? "managed" : "local";
}

/** The config source, reacting to the managed store. */
export function useConfigSource(): ConfigSource {
  const managed = useManagedConfigStore((s) => s.payload?.managedConfig ?? null);
  return getConfigSource(managed);
}

/**
 * Imperative (non-hook) effective config, for callbacks and event handlers that
 * cannot use hooks. Reads the current local and managed snapshots.
 */
export function getEffectiveConfigState(): ProviderConfig {
  const local = useSettingsStore.getState().config;
  const managed = useManagedConfigStore.getState().payload?.managedConfig ?? null;
  return getEffectiveConfig(local, managed);
}

/** Imperative (non-hook) config source, for callbacks and event handlers. */
export function getConfigSourceState(): ConfigSource {
  const managed = useManagedConfigStore.getState().payload?.managedConfig ?? null;
  return getConfigSource(managed);
}

/** Keys forced by the managed config (reactive). */
export function useForcedKeys(): (keyof ProviderConfig)[] {
  const managed = useManagedConfigStore((s) => s.payload?.managedConfig ?? null);
  return useMemo(() => getForcedKeys(managed), [managed]);
}
