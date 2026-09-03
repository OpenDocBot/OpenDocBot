import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresetSelector, getPresets, getPreset } from "../../components/settings/PresetSelector";

beforeEach(() => {
  localStorage.clear();
});

describe("PresetSelector", () => {
  it("renders with Provider label", () => {
    render(<PresetSelector baseUrl="" model="" onChange={() => {}} />);
    expect(screen.getByText("Preset")).toBeDefined();
  });

  it("select shows custom when values don't match any preset", () => {
    render(<PresetSelector baseUrl="https://custom.api" model="my-model" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("custom");
  });

  it("select shows preset by baseUrl, model change doesn't affect it", () => {
    render(<PresetSelector baseUrl="https://api.openai.com/v1" model="some-custom-model" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("openai");
  });

  it("select shows deepseek when its endpoint is pasted", () => {
    render(<PresetSelector baseUrl="https://api.deepseek.com" model="deepseek-v4-flash" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("deepseek");
  });

  it("has 7 options", () => {
    render(<PresetSelector baseUrl="" model="" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.options.length).toBe(7);
  });

  it("orders presets by popularity (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama, Custom)", () => {
    const ids = getPresets().map((p) => p.id);
    expect(ids).toEqual(["openai", "anthropic", "gemini", "deepseek", "openrouter", "ollama", "custom"]);
  });

  it("DeepSeek preset mirrors OpenAI but points at api.deepseek.com", () => {
    const preset = getPreset("deepseek");
    expect(preset?.baseUrl).toBe("https://api.deepseek.com");
    expect(preset?.model).toBe("deepseek-v4-flash");
    expect(preset?.providerId).toBe("openaicompat");
    expect(preset?.requiresKey).toBe(true);
    expect(preset?.useLegacyChatCompletions).toBe(false);
    expect(preset?.maxTokens).toBe(8192);
  });

  it("all presets default to 8192 max tokens", () => {
    for (const p of getPresets()) {
      expect(p.maxTokens).toBe(8192);
    }
  });

  it("presetId prop wins over URL matching", () => {
    render(<PresetSelector baseUrl="http://ollama-server:11434/v1" model="llama3.1" presetId="ollama" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("ollama");
  });

  it("without presetId, URL matching still applies", () => {
    render(<PresetSelector baseUrl="https://api.openai.com/v1" model="gpt-5.6-luna" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("openai");
  });

  it("custom presetId overrides URL matching", () => {
    render(<PresetSelector baseUrl="https://api.openai.com/v1" model="gpt-5.6-luna" presetId="custom" onChange={() => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("custom");
  });
});
