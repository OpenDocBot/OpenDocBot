import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "../../components/layout/Header";
import { DEFAULT_PROVIDER_CONFIG, useSettingsStore } from "../../store/settingsStore";
import { useManagedConfigStore } from "../../store/managedConfigStore";

const { refreshManagedConfig, toastError } = vi.hoisted(() => ({
  refreshManagedConfig: vi.fn(async () => "managed"),
  toastError: vi.fn(),
}));

vi.mock("../../lib/managedConfigBootstrap", () => ({ refreshManagedConfig }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

function renderHeader(showSettings: boolean) {
  return render(
    <Header showSettings={showSettings} onToggleSettings={vi.fn()} onClearChat={vi.fn()} configured />,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: { ...DEFAULT_PROVIDER_CONFIG, apiKey: "sk-test", model: "gpt-5.6-luna", baseUrl: "https://api.openai.com/v1" },
  });
  useManagedConfigStore.setState({
    state: "unmanaged",
    payload: null,
    managedInstance: false,
  });
  refreshManagedConfig.mockClear();
  toastError.mockClear();
});

describe("Header — managed config hides transfer", () => {
  it("shows the export/import icon when settings are open and unmanaged", () => {
    renderHeader(true);
    expect(screen.getByTitle("Export / import settings")).toBeInTheDocument();
  });

  it("hides the export/import icon when managed", () => {
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
    });
    renderHeader(true);
    expect(screen.queryByTitle("Export / import settings")).toBeNull();
  });

  it("keeps the icon available in the degraded (unavailable) case", () => {
    useManagedConfigStore.setState({ state: "unavailable", payload: null });
    renderHeader(true);
    expect(screen.getByTitle("Export / import settings")).toBeInTheDocument();
  });
});

describe("Header — refresh managed configuration", () => {
  function setManaged() {
    useManagedConfigStore.setState({
      state: "managed",
      payload: { managedConfig: { apiKey: "managed-key" } },
      managedInstance: true,
    });
  }

  it("shows the refresh button when managed and settings are open", () => {
    setManaged();
    renderHeader(true);
    expect(screen.getByTitle("Refresh managed configuration")).toBeInTheDocument();
  });

  it("hides the refresh button when unmanaged", () => {
    renderHeader(true);
    expect(screen.queryByTitle("Refresh managed configuration")).toBeNull();
  });

  it("keeps the refresh button when the instance is managed but no config loaded", () => {
    useManagedConfigStore.setState({
      state: "unavailable",
      payload: null,
      managedInstance: true,
    });
    renderHeader(true);
    // Both actions are offered: import as a recovery, refresh as a retry.
    expect(screen.getByTitle("Refresh managed configuration")).toBeInTheDocument();
    expect(screen.getByTitle("Export / import settings")).toBeInTheDocument();
  });

  it("refreshes and shows the done indicator on success", async () => {
    const user = userEvent.setup();
    setManaged();
    renderHeader(true);

    await user.click(screen.getByTitle("Refresh managed configuration"));

    expect(refreshManagedConfig).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTitle("Refresh managed configuration")).toHaveAttribute(
        "data-state",
        "done"
      )
    );
  });

  it("shows an error toast and keeps the button when the refresh fails", async () => {
    const user = userEvent.setup();
    setManaged();
    refreshManagedConfig.mockResolvedValueOnce("unavailable");
    renderHeader(true);

    await user.click(screen.getByTitle("Refresh managed configuration"));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTitle("Refresh managed configuration")).toHaveAttribute(
        "data-state",
        "idle"
      )
    );
  });
});
