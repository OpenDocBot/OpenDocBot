import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigTransferDialog } from "../../components/settings/ConfigTransferDialog";
import { DEFAULT_PROVIDER_CONFIG, useSettingsStore } from "../../store/settingsStore";
import { exportConfigBlob } from "../../lib/configExport";

const PASS = "my-share-passphrase";

function seed(overrides = {}) {
  useSettingsStore.setState({
    config: {
      ...DEFAULT_PROVIDER_CONFIG,
      apiKey: "sk-secret",
      model: "gpt-5.6-luna",
      baseUrl: "https://api.openai.com/v1",
      ...overrides,
    },
  });
}

function makeFile(text: string): File {
  const file = new File([text], "opendocbot-config.txt", { type: "text/plain" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  return file;
}

function passphraseInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  seed();
  createObjectURL = vi.fn(() => "blob:mock");
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConfigTransferDialog — visibility", () => {
  it("asks the user to export or import", () => {
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("closes on Escape and on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfigTransferDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ConfigTransferDialog — export", () => {
  it("generates a passphrase and copies it", async () => {
    const user = userEvent.setup();
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));

    const input = passphraseInput("transferPassphrase");
    expect(input.value).toMatch(/^[A-Za-z0-9_-]{32}$/);

    await user.click(screen.getByTitle("Copy passphrase"));
    expect(await navigator.clipboard.readText()).toBe(input.value);
  });

  it("disables Download until a passphrase is present", async () => {
    const user = userEvent.setup();
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();

    await user.type(passphraseInput("transferPassphrase"), PASS);
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("downloads the file, shows Downloaded and auto-closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfigTransferDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.type(passphraseInput("transferPassphrase"), PASS);
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Downloaded" })).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });
});

describe("ConfigTransferDialog — import", () => {
  it("disables Import until a file and passphrase are present", async () => {
    const user = userEvent.setup();
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("imports a dropped file and replaces the config", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const source = {
      ...DEFAULT_PROVIDER_CONFIG,
      providerId: "anthropic",
      apiKey: "sk-imported",
      model: "claude-haiku-4-5",
      baseUrl: "https://api.anthropic.com/v1",
      maxTokens: 1111,
    };
    const blob = await exportConfigBlob(source, PASS);

    render(<ConfigTransferDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.drop(screen.getByRole("button", { name: /drop file/i }), {
      dataTransfer: { files: [makeFile(blob)] },
    });
    expect(await screen.findByText("opendocbot-config.txt")).toBeInTheDocument();
    await user.type(passphraseInput("transferImportPassphrase"), PASS);

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(useSettingsStore.getState().config).toEqual(source);
  });

  it("imports a browsed file", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const blob = await exportConfigBlob({ ...DEFAULT_PROVIDER_CONFIG, model: "browsed-model" }, PASS);

    const { container } = render(<ConfigTransferDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile(blob)] } });
    expect(await screen.findByText("opendocbot-config.txt")).toBeInTheDocument();
    await user.type(passphraseInput("transferImportPassphrase"), PASS);

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(useSettingsStore.getState().config.model).toBe("browsed-model");
  });

  it("shows 'Wrong passphrase.' and leaves the store unchanged", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const blob = await exportConfigBlob({ ...DEFAULT_PROVIDER_CONFIG, model: "m" }, PASS);
    const before = useSettingsStore.getState().config;

    const { container } = render(<ConfigTransferDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile(blob)] },
    });
    await user.type(passphraseInput("transferImportPassphrase"), "wrong-passphrase");

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong passphrase.");
    expect(onClose).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().config).toEqual(before);
  });

  it("shows 'Invalid file.' for a file that is not a config blob", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile("definitely not a blob")] },
    });
    await user.type(passphraseInput("transferImportPassphrase"), PASS);

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid file.");
  });

  it("hides the Back button after a successful import", async () => {
    const user = userEvent.setup();
    const blob = await exportConfigBlob({ ...DEFAULT_PROVIDER_CONFIG, model: "m" }, PASS);
    const { container } = render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByTitle("Back")).toBeInTheDocument();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile(blob)] },
    });
    await user.type(passphraseInput("transferImportPassphrase"), PASS);

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();
    expect(screen.queryByTitle("Back")).toBeNull();
  });

  it("auto-closes after import even if the parent re-renders with a new onClose", async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const blob = await exportConfigBlob({ ...DEFAULT_PROVIDER_CONFIG, model: "m" }, PASS);
    const { container, rerender } = render(<ConfigTransferDialog onClose={first} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile(blob)] },
    });
    await user.type(passphraseInput("transferImportPassphrase"), PASS);

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);
    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();

    // The parent re-renders with a fresh onClose while the close timer is pending.
    const second = vi.fn();
    rerender(<ConfigTransferDialog onClose={second} />);

    await waitFor(() => expect(second).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });
});

describe("ConfigTransferDialog — keyboard", () => {
  it("downloads when Enter is pressed in the export passphrase field", async () => {
    const user = userEvent.setup();
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.type(passphraseInput("transferPassphrase"), `${PASS}{Enter}`);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  });

  it("imports when Enter is pressed in the import passphrase field", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const source = { ...DEFAULT_PROVIDER_CONFIG, model: "enter-model" };
    const blob = await exportConfigBlob(source, PASS);

    const { container } = render(<ConfigTransferDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile(blob)] },
    });
    await screen.findByText("opendocbot-config.txt");

    await user.type(passphraseInput("transferImportPassphrase"), `${PASS}{Enter}`);

    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();
    expect(useSettingsStore.getState().config.model).toBe("enter-model");
  });
});
