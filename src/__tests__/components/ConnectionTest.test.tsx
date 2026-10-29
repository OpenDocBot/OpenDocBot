/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionTest } from "../../components/settings/ConnectionTest";
import type { ProviderConfig } from "../../store/settingsStore";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const testConfig: ProviderConfig = {
  providerId: "openaicompat",
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
  bedrockRegion: "us-east-1",
  ocrLanguage: "eng",
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const foundryConfig: ProviderConfig = {
  ...testConfig,
  presetId: "foundry",
  providerId: "openaicompat",
  baseUrl: "https://example.services.ai.azure.com/openai/v1",
  model: "gpt-4o",
};

describe("ConnectionTest", () => {
  it("renders test button", () => {
    render(<ConnectionTest config={testConfig} />);
    expect(screen.getByText("Test Connection")).toBeDefined();
  });

  it("shows success state after test passes", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    } as Response);

    render(<ConnectionTest config={testConfig} />);
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeDefined();
    });
    expect(screen.queryByText("Enterprise use")).toBeNull();
  });

  it("shows the enterprise hint after a successful Foundry test", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    } as Response);

    render(<ConnectionTest config={foundryConfig} />);
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText("Enterprise use")).toBeDefined();
    });
    const link = screen.getByRole("link", { name: "Enterprise use" }) as HTMLAnchorElement;
    expect(link.href).toBe("https://opendocbot.com/enterprise");
    expect(link.target).toBe("_blank");
  });

  it("does not show the enterprise hint when disabled", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    } as Response);

    render(<ConnectionTest config={foundryConfig} showEnterpriseHint={false} />);
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeDefined();
    });
    expect(screen.queryByText("Enterprise use")).toBeNull();
  });

  it("shows the enterprise hint only once", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    } as Response);

    const first = render(<ConnectionTest config={foundryConfig} />);
    await user.click(screen.getByText("Test Connection"));
    await waitFor(() => {
      expect(screen.getByText("Enterprise use")).toBeDefined();
    });
    first.unmount();

    render(<ConnectionTest config={foundryConfig} />);
    await user.click(screen.getByText("Test Connection"));
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeDefined();
    });
    expect(screen.queryByText("Enterprise use")).toBeNull();
    expect(localStorage.getItem("opendocbot-enterprise-hint-seen")).toBe("1");
  });

  it("dismisses the enterprise hint", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    } as Response);

    render(<ConnectionTest config={foundryConfig} />);
    await user.click(screen.getByText("Test Connection"));
    await waitFor(() => {
      expect(screen.getByText("Enterprise use")).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Dismiss enterprise hint" }));
    expect(screen.queryByText("Enterprise use")).toBeNull();
  });

  it("shows error state after test fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Unauthorized"),
    } as Response);

    render(<ConnectionTest config={testConfig} />);
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeDefined();
    });
  });

  it("skips the request with a friendly error when no model is selected", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<ConnectionTest config={{ ...testConfig, model: "" }} />);
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText(/Select a model first/)).toBeDefined();
    });
    expect(screen.getByText("Failed")).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stays disabled while testing", async () => {
    const user = userEvent.setup();
    let resolveJson: (v: unknown) => void;
    const promise = new Promise((r) => { resolveJson = r; });
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(promise.then(() => ({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
    })) as any);

    render(<ConnectionTest config={testConfig} />);
    const btn = screen.getByText("Test Connection");
    await user.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });

    resolveJson!({});
  });

  it("sends custom headers for the Custom preset", async () => {
    const user = userEvent.setup();
    let init: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, i) => {
      init = i;
      return { ok: true, json: () => Promise.resolve({}) } as Response;
    });

    render(
      <ConnectionTest
        config={{
          ...testConfig,
          presetId: "custom",
          baseUrl: "https://opencode.ai/zen/go/v1",
          model: "qwen3.8-max",
          customHeaders: { "x-opencode-session": "$SESSION_ID" },
        }}
      />
    );
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeDefined();
    });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-opencode-session"]).toMatch(UUID_RE);
  });

  it("omits custom headers for non-Custom presets", async () => {
    const user = userEvent.setup();
    let init: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, i) => {
      init = i;
      return { ok: true, json: () => Promise.resolve({}) } as Response;
    });

    render(
      <ConnectionTest
        config={{ ...testConfig, presetId: "openai", customHeaders: { "x-opencode-session": "SECRET" } }}
      />
    );
    await user.click(screen.getByText("Test Connection"));

    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeDefined();
    });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-opencode-session"]).toBeUndefined();
  });
});
