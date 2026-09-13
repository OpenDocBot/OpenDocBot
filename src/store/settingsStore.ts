import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ProviderConfig {
  /** The preset the user selected (e.g. "ollama", "openai"). Persisted so that
   * editing the endpoint doesn't re-derive the preset from the URL. */
  presetId?: string;
  providerId: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  enableCache: boolean;
  recacheThreshold: number;
  useLegacyChatCompletions: boolean;
  /** Free-form reasoning effort label (e.g. low, medium, high, xhigh, max).
   * Empty string = off (don't send, use the provider default). */
  reasoningEffort: string;
  /** Route provider calls through a same-origin /proxy/ endpoint (self-hosted). */
  proxyRequests: boolean;
  /** Anthropic prompt-cache TTL ("5m" default, "1h" at 2x write cost). */
  anthropicCacheTtl: "5m" | "1h";
  /** Human-in-the-loop: require manual approval for document-modifying tool calls. */
  humanInTheLoop: boolean;
  /** Maximum agent-loop iterations per message before the loop aborts. */
  maxIterations: number;
  /** Persistent instructions injected into the agent's system prompt on every turn. */
  customInstructions: string;
  /** Custom HTTP headers for the Custom preset (values may contain $VAR tokens). */
  customHeaders?: Record<string, string>;
  /** OpenRouter sovereign-AI inference region. Maps to a regional base URL
   * (global -> openrouter.ai, eu -> eu.openrouter.ai, us -> us.openrouter.ai).
   * Only used by the openrouter preset. */
  openRouterRegion: "global" | "eu" | "us";
  /** Tesseract language code used for local OCR of scanned PDFs (default eng). */
  ocrLanguage: string;
}

interface SettingsState {
  config: ProviderConfig;
  setPresetId: (id: string) => void;
  setProviderId: (id: string) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setBaseUrl: (url: string) => void;
  setMaxTokens: (tokens: number) => void;
  setEnableCache: (value: boolean) => void;
  setRecacheThreshold: (value: number) => void;
  setUseLegacyChatCompletions: (value: boolean) => void;
  setReasoningEffort: (value: string) => void;
  setProxyRequests: (value: boolean) => void;
  setAnthropicCacheTtl: (value: "5m" | "1h") => void;
  setHumanInTheLoop: (value: boolean) => void;
  setMaxIterations: (value: number) => void;
  setCustomInstructions: (value: string) => void;
  setCustomHeaders: (value: Record<string, string>) => void;
  setOpenRouterRegion: (value: "global" | "eu" | "us") => void;
  setOcrLanguage: (value: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      config: {
        providerId: "custom",
        apiKey: "",
        model: "",
        baseUrl: "",
        maxTokens: 4096,
        enableCache: true,
        recacheThreshold: 2000,
        useLegacyChatCompletions: false,
        reasoningEffort: "",
        proxyRequests: false,
        anthropicCacheTtl: "5m",
        humanInTheLoop: false,
        maxIterations: 100,
        customInstructions: "",
        customHeaders: {},
        openRouterRegion: "global",
        ocrLanguage: "eng",
      },

      setPresetId: (id) =>
        set((s) => ({ config: { ...s.config, presetId: id } })),

      setProviderId: (id) =>
        set((s) => ({ config: { ...s.config, providerId: id } })),

      setApiKey: (key) =>
        set((s) => ({ config: { ...s.config, apiKey: key } })),

      setModel: (model) =>
        set((s) => ({ config: { ...s.config, model } })),

      setBaseUrl: (url) =>
        set((s) => ({ config: { ...s.config, baseUrl: url } })),

      setMaxTokens: (maxTokens) =>
        set((s) => ({ config: { ...s.config, maxTokens } })),

      setEnableCache: (enableCache) =>
        set((s) => ({ config: { ...s.config, enableCache } })),

      setRecacheThreshold: (recacheThreshold) =>
        set((s) => ({ config: { ...s.config, recacheThreshold } })),

      setUseLegacyChatCompletions: (useLegacyChatCompletions) =>
        set((s) => ({ config: { ...s.config, useLegacyChatCompletions } })),

      setReasoningEffort: (reasoningEffort) =>
        set((s) => ({ config: { ...s.config, reasoningEffort } })),

      setProxyRequests: (proxyRequests) =>
        set((s) => ({ config: { ...s.config, proxyRequests } })),

      setAnthropicCacheTtl: (anthropicCacheTtl) =>
        set((s) => ({ config: { ...s.config, anthropicCacheTtl } })),

      setHumanInTheLoop: (humanInTheLoop) =>
        set((s) => ({ config: { ...s.config, humanInTheLoop } })),

      setMaxIterations: (maxIterations) =>
        set((s) => ({ config: { ...s.config, maxIterations } })),

      setCustomInstructions: (customInstructions) =>
        set((s) => ({ config: { ...s.config, customInstructions } })),

      setCustomHeaders: (customHeaders) =>
        set((s) => ({ config: { ...s.config, customHeaders } })),

      setOpenRouterRegion: (openRouterRegion) =>
        set((s) => ({ config: { ...s.config, openRouterRegion } })),

      setOcrLanguage: (ocrLanguage) =>
        set((s) => ({ config: { ...s.config, ocrLanguage } })),
    }),
    {
      name: "opendocbot-settings",
      // Current schema version of the persisted config. Bump it every time the
      // config shape changes in a way `merge` cannot express (see `migrate`).
      version: 1,
      partialize: (state) => ({ config: state.config }),
      /**
       * Schema migration, run by zustand persist.
       *
       * HOW IT WORKS: zustand calls `migrate(persistedState, storedVersion)`
       * exactly ONCE on rehydrate when the stored version differs from
       * `version` above. It does NOT auto-discover intermediate versions like
       * a database migrator — this single function must apply every pending
       * step itself. Use the cascade pattern below (`if (storedVersion < N)`)
       * so a user jumping straight from an old version to the latest gets
       * each step applied in order, oldest first.
       *
       * WHAT GOES HERE: structural changes only — renamed fields, removed
       * fields, value transformations. Additive changes (new fields) are
       * handled by `merge`, which fills them with defaults.
       *
       * HOW TO ADD A MIGRATION:
       *  1. Bump `version` (e.g. 1 -> 2).
       *  2. Add an `if (storedVersion < 2) { ... }` block transforming the
       *     state v1 -> v2, keeping it idempotent and defensive (the
       *     persisted config may be missing fields from older builds).
       *  3. Test it by seeding a snapshot with the OLD version and asserting
       *     the transformed shape (see src/__tests__/store/settingsStore.test.ts).
       */
      migrate: (persistedState, storedVersion) => {
        if (storedVersion >= 1) return persistedState;
        // v0 -> v1: snapshots written before versioning existed. Drop keys
        // that no longer exist in ProviderConfig (e.g. the long-removed
        // `temperature`) so the merged config matches the current schema.
        const state = persistedState as unknown as
          | { config?: Record<string, unknown> }
          | undefined;
        if (!state || typeof state.config !== "object" || state.config === null) {
          return persistedState;
        }
        const config = { ...state.config };
        delete config.temperature;
        return { config: config as unknown as ProviderConfig };
      },
      // Merge persisted config over the defaults so newly added fields that
      // older persisted snapshots don't have fall back to their default
      // instead of becoming undefined. Handles additive changes only; see
      // `migrate` above for structural ones.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as { config?: Partial<ProviderConfig> }),
        config: { ...current.config, ...(persisted as { config?: Partial<ProviderConfig> }).config },
      }),
    }
  )
);
