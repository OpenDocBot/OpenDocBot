import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportMcpDialog } from "../../components/chat/ExportMcpDialog";
import {
  MCP_SERVERS_CREDENTIALS_FILE_NAME,
  MCP_SERVERS_FILE_NAME,
} from "../../mcp/transfer";
import type { McpServerConfig } from "../../mcp/types";

const { downloadTextFile } = vi.hoisted(() => ({ downloadTextFile: vi.fn() }));

vi.mock("../../lib/download", () => ({
  downloadTextFile,
  downloadBlob: vi.fn(),
}));

const apiKeyServer: McpServerConfig = {
  id: "a",
  name: "Alpha",
  url: "https://a.example/mcp",
  transport: "streamable-http",
  auth: { type: "apiKey", header: "X-Key", value: "supersecret" },
};

beforeEach(() => {
  downloadTextFile.mockClear();
});

describe("ExportMcpDialog", () => {
  it("exports without credentials by default", async () => {
    const user = userEvent.setup();
    render(<ExportMcpDialog servers={[apiKeyServer]} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(downloadTextFile).toHaveBeenCalledTimes(1);
    const [name, text] = downloadTextFile.mock.calls[0] as [string, string];
    expect(name).toBe(MCP_SERVERS_FILE_NAME);
    expect(text).not.toContain("supersecret");
  });

  it("includes credentials and warns when opted in", async () => {
    const user = userEvent.setup();
    render(<ExportMcpDialog servers={[apiKeyServer]} onClose={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /include credentials/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/plain text/i);

    await user.click(screen.getByRole("button", { name: "Export" }));

    const [name, text] = downloadTextFile.mock.calls[0] as [string, string];
    expect(name).toBe(MCP_SERVERS_CREDENTIALS_FILE_NAME);
    expect(text).toContain("supersecret");
  });

  it("closes without exporting on Cancel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ExportMcpDialog servers={[apiKeyServer]} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });
});
