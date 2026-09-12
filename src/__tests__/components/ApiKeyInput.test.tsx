import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeyInput } from "../../components/settings/ApiKeyInput";
import { useSettingsStore } from "../../store/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: {
      providerId: "openai",
      apiKey: "",
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

describe("ApiKeyInput", () => {
  it("renders with label", () => {
    render(<ApiKeyInput />);
    expect(screen.getByText("API Key")).toBeDefined();
  });

  it("starts in password (masked) mode", () => {
    render(<ApiKeyInput />);
    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("toggles visibility on Show/Hide click", async () => {
    const user = userEvent.setup();
    render(<ApiKeyInput />);
    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    const toggle = screen.getByText("Show");

    await user.click(toggle);
    expect(input.type).toBe("text");
  });

  it("updates store on type", async () => {
    const user = userEvent.setup();
    render(<ApiKeyInput />);
    const input = screen.getByPlaceholderText("sk-...");

    await user.type(input, "sk-test-key");
    expect(useSettingsStore.getState().config.apiKey).toBe("sk-test-key");
  });

  it("shows pre-filled key from store", () => {
    useSettingsStore.getState().setApiKey("sk-existing");
    render(<ApiKeyInput />);
    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    expect(input.value).toBe("sk-existing");
  });
});
