import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpMenu } from "../../components/chat/McpMenu";
import { useMcpStore } from "../../store/mcpStore";
import { useChatStore } from "../../store/chatStore";
import { exportMcpServersJson } from "../../mcp/transfer";
import type { McpServerConfig } from "../../mcp/types";

const server = (id: string, name: string): McpServerConfig => ({
  id,
  name,
  url: `https://${id}.example/mcp`,
  transport: "streamable-http",
  auth: { type: "none" },
});

let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useMcpStore.setState({ servers: [] });
  useChatStore.setState({ enabledMcpServerIds: [] });
  createObjectURL = vi.fn(() => "blob:mock");
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("McpMenu", () => {
  it("shows an empty state", () => {
    render(<McpMenu onCloseMenu={vi.fn()} />);
    expect(screen.getByText("No servers yet")).toBeInTheDocument();
  });

  it("lists servers and toggles enablement", async () => {
    useMcpStore.setState({ servers: [server("a", "Alpha")] });
    const user = userEvent.setup();
    render(<McpMenu onCloseMenu={vi.fn()} />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    expect(useChatStore.getState().enabledMcpServerIds).toEqual(["a"]);
    await user.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    expect(useChatStore.getState().enabledMcpServerIds).toEqual([]);
  });

  it("creates a server via the editor", async () => {
    const user = userEvent.setup();
    render(<McpMenu onCloseMenu={vi.fn()} />);

    await user.click(screen.getByRole("menuitem", { name: /new server/i }));
    await user.type(screen.getByLabelText("Name"), "My server");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useMcpStore.getState().servers).toHaveLength(1);
    expect(useMcpStore.getState().servers[0].name).toBe("My server");
  });

  it("exports the servers through the export dialog", async () => {
    useMcpStore.setState({ servers: [server("a", "Alpha")] });
    const user = userEvent.setup();
    render(<McpMenu onCloseMenu={vi.fn()} />);

    await user.click(screen.getByRole("menuitem", { name: /export servers/i }));
    expect(screen.getByRole("dialog", { name: /export mcp servers/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("imports servers from a file", async () => {
    const onCloseMenu = vi.fn();
    const { container } = render(<McpMenu onCloseMenu={onCloseMenu} />);
    const text = exportMcpServersJson([server("z", "Zeta")]);
    const file = new File([text], "servers.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(useMcpStore.getState().servers.map((s) => s.name)).toEqual(["Zeta"]),
    );
    expect(onCloseMenu).toHaveBeenCalled();
  });
});
