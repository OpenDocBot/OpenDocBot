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
    }),
    {
      name: "opendocbot-settings",
      partialize: (state) => ({ config: state.config }),
      // Merge persisted config over the defaults so newly added fields that
      // older persisted snapshots don't have fall back to their default
      // instead of becoming undefined.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as { config?: Partial<ProviderConfig> }),
        config: { ...current.config, ...(persisted as { config?: Partial<ProviderConfig> }).config },
      }),
    }
  )
);
