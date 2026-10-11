import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpServerDialog } from "../../components/chat/McpServerDialog";
import { useMcpStore } from "../../store/mcpStore";
import type { McpServerConfig } from "../../mcp/types";

vi.mock("../../mcp/manager", () => ({
  testServerConnection: vi.fn(async () => ({ ok: true, toolCount: 3 })),
}));
import { testServerConnection } from "../../mcp/manager";

const alpha: McpServerConfig = {
  id: "a",
  name: "Alpha",
  url: "https://a.example/mcp",
  transport: "streamable-http",
  auth: { type: "none" },
};

beforeEach(() => {
  useMcpStore.setState({ servers: [] });
  vi.mocked(testServerConnection).mockReset();
  vi.mocked(testServerConnection).mockResolvedValue({ ok: true, toolCount: 3 });
});

describe("McpServerDialog", () => {
  it("requires a name", async () => {
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
    expect(useMcpStore.getState().servers).toHaveLength(0);
  });

  it("requires a valid URL", async () => {
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "X");
    await user.type(screen.getByLabelText("Server URL"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid http(s) URL");
  });

  it("creates a no-auth server", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={onClose} />);
    await user.type(screen.getByLabelText("Name"), "My server");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.click(screen.getByRole("button", { name: "Save" }));

    const servers = useMcpStore.getState().servers;
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ name: "My server", url: "https://s.example/mcp" });
    expect(servers[0].auth).toEqual({ type: "none" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires a value for API-key auth", async () => {
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "X");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.selectOptions(screen.getByRole("combobox"), "apiKey");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("API key");
  });

  it("creates an API-key server", async () => {
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "X");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.selectOptions(screen.getByRole("combobox"), "apiKey");
    await user.type(screen.getByLabelText("Value"), "Bearer secret");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useMcpStore.getState().servers[0].auth).toEqual({
      type: "apiKey",
      header: "Authorization",
      value: "Bearer secret",
    });
  });

  it("updates an existing server", async () => {
    useMcpStore.setState({ servers: [alpha] });
    const user = userEvent.setup();
    render(<McpServerDialog server={alpha} onClose={vi.fn()} />);
    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(useMcpStore.getState().servers[0].name).toBe("Renamed");
  });

  it("deletes an existing server", async () => {
    useMcpStore.setState({ servers: [alpha] });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<McpServerDialog server={alpha} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(useMcpStore.getState().servers).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tests the connection and shows the tool count", async () => {
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "S");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText(/Connected — 3 tools/)).toBeInTheDocument();
  });

  it("shows a test error", async () => {
    vi.mocked(testServerConnection).mockResolvedValueOnce({ ok: false, error: "boom" });
    const user = userEvent.setup();
    render(<McpServerDialog server={null} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Name"), "S");
    await user.type(screen.getByLabelText("Server URL"), "https://s.example/mcp");
    await user.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });
});
