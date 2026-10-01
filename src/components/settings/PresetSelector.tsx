/* eslint-disable react-refresh/only-export-components */
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DEFAULT_BEDROCK_REGION } from "../../lib/bedrockModels";

export interface Preset {
  id: string;
  label: string;
  providerId: string;
  baseUrl: string;
  model: string;
  requiresKey: boolean;
  maxTokens: number;
  useLegacyChatCompletions: boolean;
  /** Optional region -> base URL map (OpenRouter sovereign AI). The preset's
   * `baseUrl` must be the "global" entry so existing URL matching still works. */
  regions?: Record<string, string>;
  /** Default region applied when this preset is selected (Bedrock). */
  defaultRegion?: string;
  /** Placeholder shown in the API key field for this preset. */
  keyPlaceholder?: string;
}

const ALL_PRESETS: Preset[] = [
  { id: "openai", label: "OpenAI", providerId: "openaicompat", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "sk-..." },
  { id: "anthropic", label: "Anthropic Claude", providerId: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-4-5", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "sk-..." },
  { id: "gemini", label: "Google Gemini", providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.5-flash-lite", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "AIza... / AQ...." },
  { id: "deepseek", label: "DeepSeek", providerId: "openaicompat", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: true, keyPlaceholder: "sk-..." },
  { id: "openrouter", label: "OpenRouter", providerId: "openaicompat", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "sk-...", regions: { global: "https://openrouter.ai/api/v1", eu: "https://eu.openrouter.ai/api/v1", us: "https://us.openrouter.ai/api/v1" } },
  { id: "ollama", label: "Ollama", providerId: "openaicompat", baseUrl: "http://localhost:11434/v1", model: "llama3.1", requiresKey: false, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "opcional" },
  { id: "bedrock", label: "Amazon Bedrock", providerId: "bedrock", baseUrl: "", model: "nvidia.nemotron-super-3-120b", requiresKey: true, maxTokens: 8192, useLegacyChatCompletions: false, defaultRegion: DEFAULT_BEDROCK_REGION, keyPlaceholder: "ABSK..." },
  { id: "custom", label: "Custom", providerId: "openaicompat", baseUrl: "", model: "", requiresKey: false, maxTokens: 8192, useLegacyChatCompletions: false, keyPlaceholder: "sk-..." },
];

export function getPresets(): Preset[] {
  return ALL_PRESETS;
}

export function matchPreset(baseUrl: string, _model: string): string {
  // An empty endpoint is always the Custom preset (Bedrock also omits its
  // endpoint, since the region derives it), so it must not be mis-detected.
  if (!baseUrl) return "custom";
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
  disabled?: boolean;
}

export function PresetSelector({ baseUrl, model, presetId, onChange, disabled }: PresetSelectorProps) {
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
        disabled={disabled}
      />
    </div>
  );
}
