import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../../components/settings/SettingsPanel";
import { useSettingsStore } from "../../store/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: {
      providerId: "openaicompat",
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 4096,
      enableCache: true,
      recacheThreshold: 8000,
      useLegacyChatCompletions: false,
      reasoningEffort: "",
      proxyRequests: false,
      anthropicCacheTtl: "5m",
  humanInTheLoop: false,
      maxIterations: 100,
      customInstructions: "",
      openRouterRegion: "global",
      ocrLanguage: "eng",
    },
  });
});

describe("SettingsPanel", () => {
  it("renders Preset and key fields", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Preset")).toBeDefined();
    expect(screen.getByText("Model")).toBeDefined();
    expect(screen.getByText("Endpoint URL")).toBeDefined();
    expect(screen.getByText("Test Connection")).toBeDefined();
  });

  it("renders Apply and Clean buttons", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Apply")).toBeDefined();
    expect(screen.getByText("Clean")).toBeDefined();
  });

  it("shows privacy notice", () => {
    render(<SettingsPanel />);
    expect(screen.getByText(/stored locally/i)).toBeDefined();
  });

  it("Apply commits changes to store", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const endpointInput = screen.getByPlaceholderText("https://api.openai.com/v1");
    await user.clear(endpointInput);
    await user.type(endpointInput, "https://custom.api/v1");

    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.baseUrl).toBe("https://custom.api/v1");
  });

  it("shows 'Applied!' feedback after clicking Apply", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    expect(screen.queryByText("Applied!")).toBeNull();
    await user.click(screen.getByText("Apply"));

    expect(screen.getByText("Applied!")).toBeDefined();
  });

  it("Clean resets to store values", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const endpointInput = screen.getByPlaceholderText("https://api.openai.com/v1") as HTMLInputElement;
    await user.clear(endpointInput);
    await user.type(endpointInput, "https://custom.api/v1");

    await user.click(screen.getByText("Clean"));

    expect(endpointInput.value).toBe("https://api.openai.com/v1");
  });

  it("renders Advanced section trigger", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Advanced")).toBeDefined();
  });

  it("has max tokens input in Advanced section", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    const maxTokensInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(maxTokensInput).toBeDefined();
    await user.clear(maxTokensInput);
    await user.type(maxTokensInput, "2048");
    expect(maxTokensInput.value).toBe("2048");
  });

  it("commits reasoning effort to the store", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));

    const effortInput = screen.getByLabelText("Reasoning Effort") as HTMLInputElement;
    await user.clear(effortInput);
    await user.type(effortInput, "high");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.reasoningEffort).toBe("high");
  });

  it("shows the legacy /chat/completions toggle for openai-compat providers", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    expect(screen.getByText("Use old /chat/completions endpoint")).toBeDefined();
  });

  it("hides the legacy /chat/completions toggle for Gemini", async () => {
    useSettingsStore.setState({
      config: { ...useSettingsStore.getState().config, providerId: "gemini" },
    });
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    expect(screen.queryByText("Use old /chat/completions endpoint")).toBeNull();
  });

  it("commits the legacy /chat/completions toggle to the store", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));

    const toggle = screen.getByLabelText("Use old /chat/completions endpoint") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.useLegacyChatCompletions).toBe(true);
  });

  it("shows the proxy checkbox in dev mode", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    expect(screen.getByText("Proxy API requests through this server")).toBeDefined();
  });

  it("commits the proxy checkbox to the store", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));

    const toggle = screen.getByLabelText("Proxy API requests through this server") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.proxyRequests).toBe(true);
  });

  it("hides Custom Headers for non-custom presets", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    expect(screen.queryByText("Custom Headers")).toBeNull();
  });

  it("shows Custom Headers only for the Custom preset", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(preset, "custom");
    await user.click(screen.getByText("Advanced"));
    expect(screen.getByText("Custom Headers")).toBeDefined();
  });

  it("resets reasoning effort when switching preset", async () => {
    useSettingsStore.setState({
      config: { ...useSettingsStore.getState().config, reasoningEffort: "high" },
    });
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(preset, "anthropic");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.reasoningEffort).toBe("");
  });

  it("shows cache controls for Gemini", async () => {
    useSettingsStore.setState({
      config: { ...useSettingsStore.getState().config, providerId: "gemini" },
    });
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));

    expect(screen.getByText("Cache rebuild size (tokens)")).toBeDefined();
  });

  it("commits cache rebuild size from Gemini controls", async () => {
    useSettingsStore.setState({
      config: { ...useSettingsStore.getState().config, providerId: "gemini" },
    });
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));

    const thresholdInput = screen.getByLabelText("Cache rebuild size (tokens)") as HTMLInputElement;
    await user.click(thresholdInput);
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("4096");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.recacheThreshold).toBe(4096);
  });

  it("editing the Ollama endpoint keeps the Ollama preset and still shows an optional API key field", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(preset, "ollama");

    const endpointInput = screen.getByPlaceholderText("https://api.openai.com/v1");
    await user.clear(endpointInput);
    await user.type(endpointInput, "http://ollama-server:11434/v1");

    const keyLabel = screen.getByLabelText(/API Key/);
    expect(keyLabel).toBeDefined();

    await user.click(screen.getByText("Apply"));
    expect(useSettingsStore.getState().config.presetId).toBe("ollama");
    expect(useSettingsStore.getState().config.baseUrl).toBe("http://ollama-server:11434/v1");
  });

  it("rehydrates a stored Ollama preset with an edited endpoint", () => {
    useSettingsStore.setState({
      config: {
        ...useSettingsStore.getState().config,
        presetId: "ollama",
        baseUrl: "http://ollama-server:11434/v1",
        model: "llama3.1",
      },
    });
    render(<SettingsPanel />);

    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    expect(preset.value).toBe("ollama");
    expect(screen.getByLabelText(/API Key/)).toBeDefined();
  });

  it("renders Connection and Behavior tabs", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Connection")).toBeDefined();
    expect(screen.getByText("Behavior")).toBeDefined();
  });

  it("shows connection fields by default", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Preset")).toBeDefined();
    expect(screen.getByText("Endpoint URL")).toBeDefined();
    expect(screen.queryByText("Human in the Loop")).toBeNull();
  });

  it("switches to Behavior tab and toggles HITL", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Behavior"));

    expect(screen.getByText("Human in the Loop")).toBeDefined();
    expect(screen.queryByText("Preset")).toBeNull();

    const toggle = screen.getByLabelText("Human in the Loop") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.humanInTheLoop).toBe(true);
  });

  it("shows Custom Instructions textarea and persists its value on Apply", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Behavior"));

    const textarea = screen.getByLabelText("Custom Instructions") as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    await user.type(textarea, "Always use British English");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.customInstructions).toBe(
      "Always use British English"
    );
  });

  it("shows Max Iterations in the Behavior tab and persists its value on Apply", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Behavior"));

    const input = screen.getByLabelText("Max Iterations") as HTMLInputElement;
    expect(input).toBeDefined();
    await user.click(input);
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("250");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.maxIterations).toBe(250);
  });

  it("shows a fair-code license link in the footer", () => {
    render(<SettingsPanel />);
    const link = screen.getByRole("link", { name: "fair-code license" }) as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.href).toBe("https://opendocbot.com/docs/license");
    expect(link.target).toBe("_blank");
  });

  it("shows the Inference region selector only for the OpenRouter preset", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await user.click(screen.getByText("Advanced"));
    expect(screen.queryByText("Inference region")).toBeNull();

    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(preset, "openrouter");
    expect(screen.getByText("Inference region")).toBeDefined();
  });

  it("commits the inference region and updates the endpoint URL for OpenRouter", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    const preset = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(preset, "openrouter");

    await user.click(screen.getByText("Advanced"));
    const regionSelect = screen
      .getAllByRole("combobox")
      .find(
        (el) =>
          el instanceof HTMLSelectElement &&
          Array.from(el.options).some((o) => o.value === "eu")
      ) as HTMLSelectElement;
    expect(regionSelect).toBeDefined();
    await user.selectOptions(regionSelect, "eu");
    await user.click(screen.getByText("Apply"));

    expect(useSettingsStore.getState().config.openRouterRegion).toBe("eu");
    expect(useSettingsStore.getState().config.baseUrl).toBe("https://eu.openrouter.ai/api/v1");
  });
});
