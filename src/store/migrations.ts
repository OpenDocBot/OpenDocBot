import type { ProviderConfig } from "./settingsStore";

/**
 * Current schema version of the persisted config. Bump it every time the
 * config shape changes in a way `merge` cannot express (see `migrateConfig`).
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Cascading migration from an older config schema version to the current one.
 *
 * HOW IT WORKS: this single function must apply every pending step itself
 * (zustand persist does not auto-discover intermediate versions). Use the
 * cascade pattern (`if (fromVersion < N)`) so a config jumping straight from an
 * old version to the latest gets each step applied in order, oldest first.
 *
 * WHAT GOES HERE: structural changes only: renamed fields, removed fields,
 * value transformations. Additive changes (new fields) are handled by the
 * store's `merge`, which fills them with defaults.
 *
 * Shared by zustand persist rehydration and imported config bundles so both
 * paths stay in sync.
 */
export function migrateConfig(raw: unknown, fromVersion: number): unknown {
  if (fromVersion >= CURRENT_CONFIG_VERSION) return raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const config = { ...(raw as Record<string, unknown>) };

  // v0 -> v1: snapshots written before versioning existed. Drop keys that no
  // longer exist in ProviderConfig (e.g. the long-removed `temperature`) so the
  // merged config matches the current schema.
  if (fromVersion < 1) {
    delete config.temperature;
  }

  return config as unknown as Partial<ProviderConfig>;
}
