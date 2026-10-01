import { create } from "zustand";
import type { ManagedConfigPayload } from "../lib/managedConfig";

/**
 * Holds the instance's managed config (self-hosted deployments) and how it was
 * resolved. Components read the effective config through
 * `useEffectiveConfig()`, not this store directly. See
 * docs/enterprise/managed-configuration.
 */
export type ManagedConfigState =
  | "loading"
  | "managed"
  | "unmanaged"
  | "unavailable";

interface ManagedConfigStore {
  state: ManagedConfigState;
  payload: ManagedConfigPayload | null;
  /** True when the deployment is managed (from the bootstrap marker), even if
   * the config has not loaded. Drives the managed-only UI (refresh button). */
  managedInstance: boolean;
  setManagedInstance: (flag: boolean) => void;
  setManaged: (payload: ManagedConfigPayload) => void;
  setUnmanaged: () => void;
  setUnavailable: (cachedPayload: ManagedConfigPayload | null) => void;
}

export const useManagedConfigStore = create<ManagedConfigStore>((set) => ({
  state: "loading",
  payload: null,
  managedInstance: false,
  setManagedInstance: (managedInstance) => set({ managedInstance }),
  setManaged: (payload) => set({ state: "managed", payload }),
  setUnmanaged: () => set({ state: "unmanaged", payload: null }),
  // A failed load (e.g. a manual refresh) keeps the last in-memory payload so
  // the instance stays managed and the user can keep working with the last
  // known settings. It only falls back to local when nothing was ever loaded.
  setUnavailable: (cachedPayload) =>
    set((s) => {
      const payload = cachedPayload ?? s.payload;
      return { state: payload ? "managed" : "unavailable", payload };
    }),
}));
