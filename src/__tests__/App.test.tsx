import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { useSettingsStore } from "../store/settingsStore";
import { useChatStore } from "../store/chatStore";
import { resetSession } from "../chat/session";

beforeEach(() => {
  localStorage.clear();
  resetSession();
  useSettingsStore.setState({
    config: {
      presetId: "openai",
      providerId: "openai",
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
  suggestionMode: false,
      maxIterations: 100,
      customInstructions: "",
      openRouterRegion: "global",
      ocrLanguage: "eng",
    },
  });
  useChatStore.setState({
    messages: [],
    isLoading: false,
    error: null,
    currentToolName: null,
  });
});

describe("App", () => {
  it("renders app title", () => {
    render(<App />);
    expect(screen.getByAltText("OpenDocBot")).toBeDefined();
  });

  it("shows dev mode banner", () => {
    render(<App />);
    expect(screen.getByText(/browser dev mode/i)).toBeDefined();
  });

  it("renders settings button in header", () => {
    render(<App />);
    expect(screen.getByTitle("Settings")).toBeDefined();
  });

  it("shows chat input after initialization", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type your request...")).toBeDefined();
    });
  });

  it("opens Settings when clicking gear icon", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTitle("Settings"));
    expect(screen.getByText("API Key")).toBeDefined();
    expect(screen.getByText("Test Connection")).toBeDefined();
  });

  it("returns to Chat when clicking gear icon again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTitle("Settings"));
    await user.click(screen.getByTitle("Settings"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type your request...")).toBeDefined();
    });
  });

  it("renders empty chat state message after init", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/write, edit, or format/i)).toBeDefined();
    });
  });

  it("has send button disabled with empty input", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send/i })).toBeDefined();
    });
    const sendBtn = screen.getByRole("button", { name: /send/i }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it("enables send button when text is typed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type your request...")).toBeDefined();
    });
    const input = screen.getByPlaceholderText("Type your request...");
    await user.type(input, "Hello");
    const sendBtn = screen.getByRole("button", { name: /send/i }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(false);
  });

  it("shows a spinner while loading and a square stop button on hover", async () => {
    useChatStore.setState({ isLoading: true });
    const { container } = render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop/i })).toBeDefined();
    });
    expect(container.querySelector(".animate-spin")).toBeDefined();

    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.mouseEnter(stopBtn);
    expect(container.querySelector(".animate-spin")).toBeNull();
    fireEvent.mouseLeave(stopBtn);
    expect(container.querySelector(".animate-spin")).toBeDefined();
  });

  it("clearing the conversation resets the loading spinner", async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTitle("Clear conversation")).toBeDefined();
    });

    useChatStore.setState({ isLoading: true, activeToolLabel: "Writing cells" });
    await user.click(screen.getByTitle("Clear conversation"));

    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().activeToolLabel).toBeNull();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

describe("App — first use welcome", () => {
  function setUnconfigured() {
    useSettingsStore.setState({
      config: {
        presetId: "openai",
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
        suggestionMode: false,
        maxIterations: 100,
        customInstructions: "",
        openRouterRegion: "global",
        ocrLanguage: "eng",
      },
    });
  }

  it("shows the welcome panel instead of the chat when no provider is configured", async () => {
    setUnconfigured();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Bring your own AI")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /connect a provider/i })).toBeDefined();
    // The chat input must not be reachable while unconfigured.
    expect(screen.queryByPlaceholderText("Type your request...")).toBeNull();
    // Chat actions make no sense before a provider exists.
    expect(screen.queryByTitle("Clear conversation")).toBeNull();
    expect(screen.queryByTitle(/suggestion mode/i)).toBeNull();
    expect(screen.getByTitle("Settings")).toBeDefined();
  });

  it("opens Settings when clicking Connect a provider", async () => {
    const user = userEvent.setup();
    setUnconfigured();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect a provider/i })).toBeDefined();
    });
    await user.click(screen.getByRole("button", { name: /connect a provider/i }));
    expect(screen.getByText("API Key")).toBeDefined();
  });

  it("shows the chat once a provider is configured", async () => {
    setUnconfigured();
    const { rerender } = render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Bring your own AI")).toBeDefined();
    });

    // Configure the provider, then re-render: welcome must be replaced by chat.
    useSettingsStore.setState({
      config: {
        presetId: "openai",
        providerId: "openai",
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
        suggestionMode: false,
        maxIterations: 100,
        customInstructions: "",
        openRouterRegion: "global",
        ocrLanguage: "eng",
      },
    });
    rerender(<App />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type your request...")).toBeDefined();
    });
    expect(screen.queryByText("Bring your own AI")).toBeNull();
    expect(screen.getByTitle("Clear conversation")).toBeDefined();
    expect(screen.getByTitle(/suggestion mode/i)).toBeDefined();
  });
});
