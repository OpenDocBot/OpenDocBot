import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelector } from "../../components/settings/ModelSelector";

describe("ModelSelector", () => {
  const baseProps = { apiKey: "sk-test", model: "gpt-4o", baseUrl: "https://api.openai.com/v1", providerId: "openaicompat", onChange: () => {} };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with label", () => {
    render(<ModelSelector {...baseProps} />);
    expect(screen.getByText("Model")).toBeDefined();
  });

  it("shows loading state initially", () => {
    render(<ModelSelector {...baseProps} />);
    expect(screen.getByText(/loading models/i)).toBeDefined();
  });

  it("manual mode skips the model fetch and shows a plain input", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();

    function Controlled() {
      const [value, setValue] = useState("DeepSeek-V4-Flash");
      return <ModelSelector {...baseProps} model={value} manualModel onChange={setValue} />;
    }

    render(<Controlled />);

    expect(spy).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText(
      "Deployment name, e.g. DeepSeek-V4-Flash"
    ) as HTMLInputElement;
    expect(input.value).toBe("DeepSeek-V4-Flash");

    await user.clear(input);
    await user.type(input, "MyDeployment");
    expect(input.value).toBe("MyDeployment");
  });

  it("shows models after fetch succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    } as Response);

    render(<ModelSelector {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("gpt-4o")).toBeDefined();
    });
  });

  it("falls back to text input on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false, status: 401, statusText: "Unauthorized",
      text: () => Promise.resolve("Unauthorized"),
    } as Response);

    render(<ModelSelector {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter model name...")).toBeDefined();
    });
  });

  it("shows a friendly message when the network fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<ModelSelector {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't reach the provider to list models/i)).toBeDefined();
    });
    expect(screen.getByPlaceholderText("Enter model name...")).toBeDefined();
  });

  it("routes the models fetch through /proxy/ when proxyRequests is on", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "deepseek-v4-flash" }] }),
    } as Response);

    render(<ModelSelector {...baseProps} baseUrl="https://opencode.ai/zen/go/v1" proxyRequests onChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("deepseek-v4-flash")).toBeDefined();
    });

    expect(spy.mock.calls[0][0]).toBe(
      `/proxy/${encodeURIComponent("https://opencode.ai/zen/go/v1")}/models`
    );
  });

  it("fetches models directly (no proxy) when proxyRequests is off", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "gpt-4o" }] }),
    } as Response);

    render(<ModelSelector {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("gpt-4o")).toBeDefined();
    });

    expect(spy.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("calls onChange via dropdown selection", async () => {
    let selected = "";
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    } as Response);

    render(<ModelSelector {...baseProps} model="gpt-4o" onChange={(v) => { selected = v; }} />);
    await waitFor(() => {
      expect(screen.getByText("gpt-4o")).toBeDefined();
    });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "gpt-4o-mini");
    expect(selected).toBe("gpt-4o-mini");
  });

  it("auto-selects the first model when none is set yet", async () => {
    let selected = "";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }] }),
    } as Response);

    render(
      <ModelSelector
        {...baseProps}
        model=""
        onChange={(v) => { selected = v; }}
      />
    );
    await waitFor(() => {
      expect(selected).toBe("deepseek-v4-pro");
    });
  });

  it("does not override an already chosen model", async () => {
    let selected = "gpt-4o";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "gpt-5" }, { id: "gpt-4o-mini" }] }),
    } as Response);

    render(
      <ModelSelector
        {...baseProps}
        model="gpt-4o"
        onChange={(v) => { selected = v; }}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("gpt-5")).toBeDefined();
    });
    expect(selected).toBe("gpt-4o");
  });

  it("renders a placeholder option so an unset value is visibly unselected", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "gpt-4o" }] }),
    } as Response);

    render(<ModelSelector {...baseProps} model="" onChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Select a model...")).toBeDefined();
    });
  });
});
