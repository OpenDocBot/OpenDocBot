/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { getProvider } from "../../providers/registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { ModelInfo } from "../../providers/types";

const CUSTOM_VALUE = "__custom__";

interface ModelSelectorProps {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerId: string;
  proxyRequests?: boolean;
  /** AWS region, only meaningful for the Bedrock provider. */
  region?: string;
  /** Show a "Custom model ID" option so users can override the fetched list. */
  allowCustomModel?: boolean;
  onChange: (model: string) => void;
  filterFree?: boolean;
  /** Disable the control (managed config forces the model). */
  disabled?: boolean;
}

export function ModelSelector({ apiKey, model, baseUrl, providerId, proxyRequests, region, allowCustomModel, onChange, filterFree: showFreeFilter, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [custom, setCustom] = useState(false);

  const fetchModels = useCallback(async () => {
    const provider = getProvider(providerId);

    if (!apiKey || (!baseUrl && !region)) {
      setModels([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await provider.listModels(apiKey, baseUrl || undefined, proxyRequests, region);
      setModels(result);
    } catch (err) {
      setError((err as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, providerId, proxyRequests, region]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Keep the visible selection consistent with state: a native <select> with
  // value="" would otherwise show the first option as if selected while the
  // stored model stays empty. Auto-select only when no model has been chosen.
  useEffect(() => {
    if (models.length > 0 && !model && !custom) {
      onChange(models[0].id);
    }
  }, [models, model, custom, onChange]);

  const customSelected = custom;

  return (
    <div className="space-y-1.5">
      <Label>Model</Label>
      {loading ? (
        <div className="flex items-center gap-2 px-2 py-1.5 font-mono text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span className="text-primary select-none">$</span>
          Loading models...
        </div>
      ) : error ? (
        <div className="space-y-1.5">
          <Input
            value={model}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter model name..."
            disabled={disabled}
          />
          <p className="text-xs text-amber-500">{error}</p>
        </div>
      ) : models.length > 0 || customSelected ? (
        <>
          {showFreeFilter && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pb-1 font-mono">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
                className="accent-primary"
              />
              Free models only
            </label>
          )}
          <Select
            value={customSelected ? CUSTOM_VALUE : model}
            onValueChange={(value) => {
              if (value === CUSTOM_VALUE) {
                setCustom(true);
                return;
              }
              setCustom(false);
              onChange(value);
            }}
            placeholder="Select a model..."
            options={[
              ...models
                .filter((m) => !freeOnly || !showFreeFilter || m.id.endsWith(":free"))
                .map((m) => ({ value: m.id, label: m.name })),
              ...(allowCustomModel
                ? [{ value: CUSTOM_VALUE, label: "Custom model ID…" }]
                : []),
            ]}
            disabled={disabled}
          />
          {customSelected && (
            <Input
              value={model}
              onChange={(e) => onChange(e.target.value)}
              placeholder="e.g. us.anthropic.claude-sonnet-4-6"
              disabled={disabled}
            />
          )}
        </>
      ) : baseUrl ? (
        <Input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter model name..."
          disabled={disabled}
        />
      ) : (
        <Input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Set endpoint first..."
          disabled
        />
      )}
    </div>
  );
}
