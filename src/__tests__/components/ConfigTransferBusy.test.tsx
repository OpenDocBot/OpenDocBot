import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pending = vi.hoisted(() => ({
  resolveExport: null as null | ((value: string) => void),
  resolveImport: null as null | ((value: unknown) => void),
}));

vi.mock("../../lib/configExport", () => ({
  exportConfigBlob: () =>
    new Promise<string>((resolve) => {
      pending.resolveExport = resolve;
    }),
  importConfigBlob: () =>
    new Promise<unknown>((resolve) => {
      pending.resolveImport = resolve;
    }),
}));

import { ConfigTransferDialog } from "../../components/settings/ConfigTransferDialog";
import { DEFAULT_PROVIDER_CONFIG, useSettingsStore } from "../../store/settingsStore";

function makeFile(text: string): File {
  const file = new File([text], "opendocbot-config.txt", { type: "text/plain" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  return file;
}

beforeEach(() => {
  localStorage.clear();
  pending.resolveExport = null;
  pending.resolveImport = null;
  useSettingsStore.setState({ config: { ...DEFAULT_PROVIDER_CONFIG } });
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:mock"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("ConfigTransferDialog — busy states", () => {
  it("shows Downloading... while the file is being prepared", async () => {
    const user = userEvent.setup();
    render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.type(document.getElementById("transferPassphrase") as HTMLInputElement, "passphrase-1234");
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(screen.getByRole("button", { name: "Downloading..." })).toBeDisabled();

    await waitFor(() => expect(pending.resolveExport).not.toBeNull());
    await act(async () => {
      pending.resolveExport?.("ODB1.mock");
    });
    expect(await screen.findByRole("button", { name: "Downloaded" })).toBeInTheDocument();
  });

  it("shows Importing... while the config is being decrypted", async () => {
    const user = userEvent.setup();
    const { container } = render(<ConfigTransferDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [makeFile("ODB1.mock")] },
    });
    await user.type(document.getElementById("transferImportPassphrase") as HTMLInputElement, "passphrase-1234");

    const importButton = screen.getByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(screen.getByRole("button", { name: "Importing..." })).toBeDisabled();

    await waitFor(() => expect(pending.resolveImport).not.toBeNull());
    await act(async () => {
      pending.resolveImport?.({ config: { ...DEFAULT_PROVIDER_CONFIG, model: "mock" }, envelope: {} });
    });
    expect(await screen.findByText("Settings imported successfully.")).toBeInTheDocument();
  });
});
