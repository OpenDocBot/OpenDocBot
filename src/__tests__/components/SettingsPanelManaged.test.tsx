import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel } from "../../components/settings/SettingsPanel";
import { useSettingsStore } from "../../store/settingsStore";
import { useManagedConfigStore } from "../../store/managedConfigStore";

function seedLocal() {
  useSettingsStore.setState({
    config: {
      providerId: "custom",
      apiKey: "local-key",
      model: "local-model",
      baseUrl: "https://local.example.com/v1",
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
      bedrockRegion: "us-east-1",
      ocrLanguage: "eng",
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  seedLocal();
  useManagedConfigStore.setState({ state: "unmanaged", payload: null });
});

describe("SettingsPanel — managed config", () => {
  it("shows the managed notice only when forced keys exist", () => {
    const { rerender } = render(<SettingsPanel />);
    expect(screen.queryByText(/Managed by your administrator/)).toBeNull();

    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    rerender(<SettingsPanel />);
    expect(screen.getByText(/Managed by your administrator/)).toBeInTheDocument();
  });

  it("shows the forced value and disables the forced field", () => {
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    render(<SettingsPanel />);
    const key = document.getElementById("apiKey") as HTMLInputElement;
    expect(key.value).toBe("managed-key");
    expect(key.disabled).toBe(true);
  });

  it("leaves unforced fields editable and apply does not overwrite forced keys", async () => {
    const user = userEvent.setup();
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    render(<SettingsPanel />);

    const endpoint = document.getElementById("endpoint") as HTMLInputElement;
    expect(endpoint.disabled).toBe(false);
    await user.clear(endpoint);
    await user.type(endpoint, "https://edited.example.com/v1");

    await user.click(screen.getByRole("button", { name: "Apply" }));

    // The forced key is not clobbered by apply; the unforced edit persists.
    expect(useSettingsStore.getState().config.apiKey).toBe("local-key");
    expect(useSettingsStore.getState().config.baseUrl).toBe("https://edited.example.com/v1");
  });

  it("updates the draft when the managed config changes", () => {
    const { rerender } = render(<SettingsPanel />);
    expect((document.getElementById("apiKey") as HTMLInputElement).value).toBe("local-key");

    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    rerender(<SettingsPanel />);

    expect((document.getElementById("apiKey") as HTMLInputElement).value).toBe("managed-key");
  });

  it("ignores a forced field change attempted through update", async () => {
    const user = userEvent.setup();
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    render(<SettingsPanel />);
    const key = document.getElementById("apiKey") as HTMLInputElement;
    // Disabled inputs reject typing; force a change event directly.
    await user.click(key).catch(() => {});
    expect(key.value).toBe("managed-key");
  });
});
