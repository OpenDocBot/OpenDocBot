import { describe, it, expect, afterEach, vi } from "vitest";
import { openAuthDialog } from "../../../mcp/oauth/dialog";

type Handler = (args: unknown) => void;

function makeDialog() {
  const handlers: Record<string, Handler> = {};
  return {
    close: vi.fn(),
    addEventHandler: vi.fn((type: string, handler: Handler) => {
      handlers[type] = handler;
    }),
    handlers,
  };
}

function installOffice() {
  const displayDialogAsync = vi.fn();
  (globalThis as unknown as { Office: unknown }).Office = {
    AsyncResultStatus: { Failed: "failed", Succeeded: "succeeded" },
    EventType: {
      DialogMessageReceived: "dialogMessageReceived",
      DialogEventReceived: "dialogEventReceived",
    },
    context: { ui: { displayDialogAsync } },
  };
  return { displayDialogAsync };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("openAuthDialog (Office dialog API)", () => {
  afterEach(() => {
    delete (globalThis as unknown as { Office?: unknown }).Office;
    vi.restoreAllMocks();
  });

  it("opens without the framework prompt and resolves the redirect", async () => {
    const { displayDialogAsync } = installOffice();
    const dialog = makeDialog();
    displayDialogAsync.mockImplementationOnce(
      (_url: string, _opts: unknown, cb: (r: unknown) => void) => {
        cb({ status: "succeeded", value: dialog });
      },
    );

    const promise = openAuthDialog("https://as.example/authorize");
    await flush();
    dialog.handlers.dialogMessageReceived({
      message: JSON.stringify({ redirect: "https://localhost:3000/auth/mcp.html?code=abc&state=s" }),
    });

    await expect(promise).resolves.toContain("code=abc");
    expect(displayDialogAsync).toHaveBeenCalledTimes(1);
    expect(displayDialogAsync.mock.calls[0][1]).toMatchObject({ promptBeforeOpen: false });
  });

  it("retries with the framework prompt when the first dialog is blocked", async () => {
    const { displayDialogAsync } = installOffice();
    const dialog = makeDialog();
    displayDialogAsync
      .mockImplementationOnce((_url: string, _opts: unknown, cb: (r: unknown) => void) => {
        cb({ status: "failed", error: { message: "popup blocked" } });
      })
      .mockImplementationOnce((_url: string, _opts: unknown, cb: (r: unknown) => void) => {
        cb({ status: "succeeded", value: dialog });
      });

    const promise = openAuthDialog("https://as.example/authorize");
    await flush();
    dialog.handlers.dialogMessageReceived({
      message: JSON.stringify({ redirect: "https://localhost:3000/auth/mcp.html?code=xyz&state=s" }),
    });

    await expect(promise).resolves.toContain("code=xyz");
    expect(displayDialogAsync).toHaveBeenCalledTimes(2);
    expect(displayDialogAsync.mock.calls[0][1].promptBeforeOpen).toBe(false);
    expect(displayDialogAsync.mock.calls[1][1].promptBeforeOpen).toBe(true);
  });
});
