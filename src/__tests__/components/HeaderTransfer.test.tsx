import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "../../components/layout/Header";
import { DEFAULT_PROVIDER_CONFIG, useSettingsStore } from "../../store/settingsStore";

function renderHeader(showSettings: boolean) {
  return render(
    <Header
      showSettings={showSettings}
      onToggleSettings={vi.fn()}
      onClearChat={vi.fn()}
      configured
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    config: {
      ...DEFAULT_PROVIDER_CONFIG,
      apiKey: "sk-test",
      model: "gpt-5.6-luna",
      baseUrl: "https://api.openai.com/v1",
      suggestionMode: false,
    },
  });
});

describe("Header — transfer icon visibility", () => {
  it("shows chat actions and hides the transfer icon when settings are closed", () => {
    renderHeader(false);
    expect(screen.getByTitle("Clear conversation")).toBeInTheDocument();
    expect(screen.getByTitle(/suggestion mode/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Export / import settings")).toBeNull();
  });

  it("hides chat actions and shows the transfer icon when settings are open", () => {
    renderHeader(true);
    expect(screen.queryByTitle("Clear conversation")).toBeNull();
    expect(screen.queryByTitle(/suggestion mode/i)).toBeNull();
    expect(screen.getByTitle("Export / import settings")).toBeInTheDocument();
  });

  it("opens the transfer dialog when the icon is clicked", async () => {
    const user = userEvent.setup();
    renderHeader(true);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByTitle("Export / import settings"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });
});
