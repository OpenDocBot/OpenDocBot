import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PROVIDER_CONFIG,
  useSettingsStore,
} from "../../store/settingsStore";

const STORAGE_KEY = "opendocbot-settings";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  useSettingsStore.setState({ config: { ...DEFAULT_PROVIDER_CONFIG } });
});

describe("settingsStore — replaceConfig", () => {
  it("sets every field at once", () => {
    useSettingsStore.getState().replaceConfig({
      ...DEFAULT_PROVIDER_CONFIG,
      providerId: "openaicompat",
      apiKey: "sk-new",
      model: "gpt-5.6-luna",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 999,
      humanInTheLoop: true,
    });

    const { config } = useSettingsStore.getState();
    expect(config.apiKey).toBe("sk-new");
    expect(config.model).toBe("gpt-5.6-luna");
    expect(config.maxTokens).toBe(999);
    expect(config.humanInTheLoop).toBe(true);
  });

  it("persists the replaced config", () => {
    useSettingsStore
      .getState()
      .replaceConfig({ ...DEFAULT_PROVIDER_CONFIG, apiKey: "sk-persist" });

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(parsed.state.config.apiKey).toBe("sk-persist");
  });

  it("replaces rather than merges (previous values are dropped)", () => {
    useSettingsStore.getState().setApiKey("sk-old");
    useSettingsStore.getState().setModel("old-model");

    useSettingsStore.getState().replaceConfig({ ...DEFAULT_PROVIDER_CONFIG });

    expect(useSettingsStore.getState().config.apiKey).toBe("");
    expect(useSettingsStore.getState().config.model).toBe("");
  });

  it("does not retain a reference to the incoming config object", () => {
    const incoming = { ...DEFAULT_PROVIDER_CONFIG, apiKey: "sk-ref" };
    useSettingsStore.getState().replaceConfig(incoming);
    incoming.apiKey = "mutated";
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-ref");
  });

  it("DEFAULT_PROVIDER_CONFIG matches the store's initial config", () => {
    expect(useSettingsStore.getState().config).toEqual(DEFAULT_PROVIDER_CONFIG);
  });
});
