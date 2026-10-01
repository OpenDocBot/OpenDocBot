import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CURRENT_CONFIG_VERSION, migrateConfig } from "./migrations";

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
  /** Suggestion mode: read-only review. Content-modifying tools are removed and
   * the agent can only insert native comments via add_suggestion. Word/Excel only. */
  suggestionMode: boolean;
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
  /** AWS region for the Bedrock preset. The runtime endpoint is derived from
   * this value (https://bedrock-runtime.<region>.amazonaws.com). */
  bedrockRegion: string;
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
  setSuggestionMode: (value: boolean) => void;
  setMaxIterations: (value: number) => void;
  setCustomInstructions: (value: string) => void;
  setCustomHeaders: (value: Record<string, string>) => void;
  setOpenRouterRegion: (value: "global" | "eu" | "us") => void;
  setBedrockRegion: (value: string) => void;
  setOcrLanguage: (value: string) => void;
  /** Replace the entire config at once (used by config import). */
  replaceConfig: (config: ProviderConfig) => void;
}

/**
 * Default configuration. Exported so config import can build a complete config
 * from a partial imported bundle (replace-all semantics: imported keys apply,
 * everything absent falls back to these defaults).
 */
export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
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
  suggestionMode: false,
  maxIterations: 100,
  customInstructions: "",
  customHeaders: {},
  openRouterRegion: "global",
  bedrockRegion: "us-east-1",
  ocrLanguage: "eng",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_PROVIDER_CONFIG },

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

      setSuggestionMode: (suggestionMode) =>
        set((s) => ({ config: { ...s.config, suggestionMode } })),

      setMaxIterations: (maxIterations) =>
        set((s) => ({ config: { ...s.config, maxIterations } })),

      setCustomInstructions: (customInstructions) =>
        set((s) => ({ config: { ...s.config, customInstructions } })),

      setCustomHeaders: (customHeaders) =>
        set((s) => ({ config: { ...s.config, customHeaders } })),

      setOpenRouterRegion: (openRouterRegion) =>
        set((s) => ({ config: { ...s.config, openRouterRegion } })),

      setBedrockRegion: (bedrockRegion) =>
        set((s) => ({ config: { ...s.config, bedrockRegion } })),

      setOcrLanguage: (ocrLanguage) =>
        set((s) => ({ config: { ...s.config, ocrLanguage } })),

      replaceConfig: (config) => set({ config: { ...config } }),
    }),
    {
      name: "opendocbot-settings",
      // Current schema version of the persisted config. Bump it every time the
      // config shape changes in a way `merge` cannot express (see `migrate`).
      version: CURRENT_CONFIG_VERSION,
      partialize: (state) => ({ config: state.config }),
      /**
       * Schema migration, run by zustand persist. The cascade itself lives in
       * `migrateConfig` (shared with config import) so both paths stay in sync.
       *
       * HOW IT WORKS: zustand calls `migrate(persistedState, storedVersion)`
       * exactly ONCE on rehydrate when the stored version differs from
       * `version` above. See `src/store/migrations.ts`.
       */
      migrate: (persistedState, storedVersion) => {
        if (storedVersion >= CURRENT_CONFIG_VERSION) return persistedState;
        const state = persistedState as
          | { config?: unknown; [key: string]: unknown }
          | undefined;
        if (!state || typeof state.config !== "object" || state.config === null) {
          return persistedState;
        }
        return { ...state, config: migrateConfig(state.config, storedVersion) };
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
