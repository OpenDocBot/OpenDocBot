/* eslint-disable react-refresh/only-export-components */
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { isProxyEnabled } from "../../lib/proxyEnabled";

export interface Preset {
  id: string;
  label: string;
  providerId: string;
  baseUrl: string;
  model: string;
  requiresKey: boolean;
  maxTokens: number;
  useLegacyChatCompletions: boolean;
  proxyRequests?: boolean;
}

const ALL_PRESETS: Preset[] = [
  { id: "openai", label: "OpenAI", providerId: "openaicompat", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false },
  { id: "anthropic", label: "Anthropic Claude", providerId: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-4-5", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false },
  { id: "gemini", label: "Google Gemini", providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.5-flash-lite", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false },
  { id: "deepseek", label: "DeepSeek", providerId: "openaicompat", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false },
  { id: "openrouter", label: "OpenRouter", providerId: "openaicompat", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false },
  {
    id: "opencode",
    label: "OpenCode Zen",
    providerId: "openaicompat",
    baseUrl: "https://opencode.ai/zen/go/v1",
    model: "deepseek-v4-flash",
    requiresKey: true,
    maxTokens: 8192,
    useLegacyChatCompletions: false,
    // OpenCode Zen has no browser CORS — it can only connect through the proxy.
    proxyRequests: true,
  },
  { id: "ollama", label: "Ollama", providerId: "openaicompat", baseUrl: "http://localhost:11434/v1", model: "llama3.1", requiresKey: false, maxTokens: 8192, useLegacyChatCompletions: false },
  { id: "custom", label: "Custom", providerId: "openaicompat", baseUrl: "", model: "", requiresKey: false, maxTokens: 8192, useLegacyChatCompletions: false },
];

/** Presets that can actually connect in this deployment. OpenCode Zen requires
 * the proxy, so on static (non-self-hosted) builds it is hidden. */
export function getPresets(proxyEnabled: boolean = isProxyEnabled()): Preset[] {
  return proxyEnabled
    ? ALL_PRESETS
    : ALL_PRESETS.filter((p) => p.id !== "opencode");
}

export function matchPreset(baseUrl: string, _model: string): string {
  const exact = getPresets().find((p) => p.baseUrl === baseUrl);
  return exact ? exact.id : "custom";
}

export function getPreset(id: string): Preset | undefined {
  return getPresets().find((p) => p.id === id);
}

interface PresetSelectorProps {
  baseUrl: string;
  model: string;
  /** Explicitly selected preset id. When present it wins over URL matching,
   * so editing the endpoint keeps the preset (e.g. Ollama on a remote host). */
  presetId?: string;
  onChange: (presetId: string) => void;
}

export function PresetSelector({ baseUrl, model, presetId, onChange }: PresetSelectorProps) {
  const currentPresetId = presetId || matchPreset(baseUrl, model);

  const options = getPresets().map((p) => ({
    value: p.id,
    label: p.label,
  }));

  return (
    <div className="space-y-1.5">
      <Label>Preset</Label>
      <Select
        value={currentPresetId}
        onValueChange={onChange}
        options={options}
      />
    </div>
  );
}
