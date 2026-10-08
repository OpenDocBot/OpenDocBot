/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import { getProvider } from "../../providers/registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { ModelInfo } from "../../providers/types";

const CUSTOM_VALUE = "__custom__";

/** Turn opaque network failures into an actionable message. */
function describeModelError(error: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(error)) {
    return "Couldn't reach the provider to list models. Enter the model name below.";
  }
  return error;
}

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
  /** Skip model discovery entirely and accept a free-text name (Foundry
   * deployments are addressed by their deployment name, not a catalogue id). */
  manualModel?: boolean;
  onChange: (model: string) => void;
  filterFree?: boolean;
  /** Disable the control (managed config forces the model). */
  disabled?: boolean;
}

export function ModelSelector({ apiKey, model, baseUrl, providerId, proxyRequests, region, allowCustomModel, manualModel, onChange, filterFree: showFreeFilter, disabled }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (manualModel) {
      setModels([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const provider = getProvider(providerId);

    if (!apiKey || (!baseUrl && !region)) {
      setModels([]);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    provider
      .listModels(apiKey, baseUrl || undefined, proxyRequests, region)
      .then((result) => {
        if (cancelled) return;
        setModels(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
        setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, baseUrl, providerId, proxyRequests, region, manualModel]);

  // Keep the visible selection consistent with state: a native <select> with
  // value="" would otherwise show the first option as if selected while the
  // stored model stays empty. Auto-select only when no model has been chosen.
  useEffect(() => {
    if (models.length > 0 && !model && !custom) {
      onChange(models[0].id);
    }
  }, [models, model, custom, onChange]);

  const customSelected = custom;

  if (manualModel) {
    return (
      <div className="space-y-1.5">
        <Label>Model</Label>
        <Input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Deployment name, e.g. DeepSeek-V4-Flash"
          disabled={disabled}
        />
      </div>
    );
  }

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
          <p className="text-xs text-amber-500">{describeModelError(error)}</p>
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
