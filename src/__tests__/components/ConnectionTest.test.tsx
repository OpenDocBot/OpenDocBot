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
  maxIterations: 100,
  customInstructions: "",
  openRouterRegion: "global",
  ocrLanguage: "eng",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

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
