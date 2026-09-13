/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";
import { getProvider } from "../../providers/registry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { ModelInfo } from "../../providers/types";

interface ModelSelectorProps {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerId: string;
  proxyRequests?: boolean;
  onChange: (model: string) => void;
  filterFree?: boolean;
}

export function ModelSelector({ apiKey, model, baseUrl, providerId, proxyRequests, onChange, filterFree: showFreeFilter }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);

  const fetchModels = useCallback(async () => {
    const provider = getProvider(providerId);

    if (!apiKey || !baseUrl) {
      setModels([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await provider.listModels(apiKey, baseUrl || undefined, proxyRequests);
      setModels(result);
    } catch (err) {
      setError((err as Error).message);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, providerId, proxyRequests]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Keep the visible selection consistent with state: a native <select> with
  // value="" would otherwise show the first option as if selected while the
  // stored model stays empty. Auto-select only when no model has been chosen.
  useEffect(() => {
    if (models.length > 0 && !model) {
      onChange(models[0].id);
    }
  }, [models, model, onChange]);

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
          />
          <p className="text-xs text-amber-500">{error}</p>
        </div>
      ) : models.length > 0 ? (
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
            value={model}
            onValueChange={onChange}
            placeholder="Select a model..."
            options={models
              .filter((m) => !freeOnly || !showFreeFilter || m.id.endsWith(":free"))
              .map((m) => ({ value: m.id, label: m.name }))}
          />
        </>
      ) : baseUrl ? (
        <Input
          value={model}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter model name..."
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
