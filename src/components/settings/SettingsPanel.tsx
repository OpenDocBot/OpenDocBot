import { useState } from "react";
import { useSettingsStore, type ProviderConfig } from "../../store/settingsStore";
import { PresetSelector, matchPreset, getPreset } from "./PresetSelector";
import { ProviderSelect } from "./ProviderSelect";
import { ModelSelector } from "./ModelSelector";
import { ConnectionTest } from "./ConnectionTest";
import { CustomHeadersEditor } from "./CustomHeadersEditor";
import { isProxyEnabled } from "../../lib/proxyEnabled";
import { APP_VERSION, BUILD_ID } from "../../lib/buildInfo";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

/**
 * The `/proxy/` route only exists on self-hosted / dev deployments. GitHub
 * Pages builds set VITE_PROXY_ENABLED=false, which hides the checkbox.
 */
const proxyEnabled = isProxyEnabled();

function useDraftConfig() {
  const store = useSettingsStore();
  const [draft, setDraft] = useState<ProviderConfig>(() => ({ ...store.config }));

  function update<K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    store.setPresetId(draft.presetId ?? "");
    store.setApiKey(draft.apiKey);
    store.setModel(draft.model);
    store.setBaseUrl(draft.baseUrl);
    store.setMaxTokens(draft.maxTokens);
    store.setProviderId(draft.providerId);
    store.setEnableCache(draft.enableCache);
    store.setRecacheThreshold(draft.recacheThreshold);
    store.setUseLegacyChatCompletions(draft.useLegacyChatCompletions);
    store.setReasoningEffort(draft.reasoningEffort);
    store.setProxyRequests(draft.proxyRequests);
    store.setAnthropicCacheTtl(draft.anthropicCacheTtl);
    store.setHumanInTheLoop(draft.humanInTheLoop);
    store.setMaxIterations(draft.maxIterations);
    store.setCustomInstructions(draft.customInstructions ?? "");
    store.setCustomHeaders(draft.customHeaders ?? {});
    store.setOpenRouterRegion(draft.openRouterRegion);
    return true;
  }

  function reset() {
    setDraft({ ...store.config });
  }

  return { draft, update, apply, reset };
}

export function SettingsPanel() {
  const { draft, update, apply, reset } = useDraftConfig();
  const [activeTab, setActiveTab] = useState<"connection" | "behavior">("connection");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const TAB_LABELS: Record<"connection" | "behavior", string> = {
    connection: "Connection",
    behavior: "Behavior",
  };

  // Prefer the explicitly selected preset so endpoint edits keep the preset
  // identity (e.g. Ollama pointed at a remote server). Fall back to URL
  // matching for legacy configs that predate the stored presetId.
  const currentPresetId =
    draft.presetId && getPreset(draft.presetId) ? draft.presetId : matchPreset(draft.baseUrl, draft.model);
  const currentPreset = getPreset(currentPresetId);
  const requiresKey = currentPreset?.requiresKey ?? true;

  function handlePresetChange(presetId: string) {
    const preset = getPreset(presetId);
    if (!preset) return;
    update("presetId", presetId);
    update("apiKey", "");
    update("providerId", preset.providerId ?? "openaicompat");
    update("reasoningEffort", "");
    if (preset.id === "custom") {
      update("baseUrl", "");
      update("model", "");
      update("maxTokens", 4096);
    } else {
      update("baseUrl", preset.baseUrl);
      update("model", preset.model);
      update("maxTokens", preset.maxTokens);
    }
    update("useLegacyChatCompletions", preset.useLegacyChatCompletions ?? false);
  }

  function handleRegionChange(region: "global" | "eu" | "us") {
    update("openRouterRegion", region);
    // Region maps to a regional base URL (openrouter.ai / eu.openrouter.ai /
    // us.openrouter.ai). Swapping baseUrl is what actually routes the request
    // in-region, and also makes the model list reload from that region.
    const url = currentPreset?.regions?.[region];
    if (url) update("baseUrl", url);
  }

  return (
    <div className="flex flex-col gap-4 p-4 font-mono">
      <div className="flex border border-border bg-muted/30">
        {(["connection", "behavior"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 px-3 font-mono text-xs uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "connection" ? (
        <>
      <PresetSelector
        baseUrl={draft.baseUrl}
        model={draft.model}
        presetId={draft.presetId}
        onChange={handlePresetChange}
      />

      {currentPresetId === "custom" && (
        <ProviderSelect
          value={draft.providerId}
          onChange={(id) => update("providerId", id)}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="endpoint">Endpoint URL</Label>
        <Input
          id="endpoint"
          value={draft.baseUrl}
          onChange={(e) => update("baseUrl", e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apiKey">API Key {!requiresKey && <span className="text-muted-foreground">(optional)</span>}</Label>
        <Input
          id="apiKey"
          type="password"
          autoComplete="new-password"
          value={draft.apiKey}
          onChange={(e) => update("apiKey", e.target.value)}
          placeholder="sk-..."
        />
      </div>

      <ModelSelector
        apiKey={draft.apiKey}
        model={draft.model}
        baseUrl={draft.baseUrl}
        providerId={draft.providerId}
        proxyRequests={draft.proxyRequests}
        onChange={(model) => update("model", model)}
        filterFree={currentPresetId === "openrouter"}
      />

      <Separator />

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center justify-between w-full font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors py-1">
            <span>
              <span className="text-primary mr-1.5 select-none">▸</span>
              Advanced
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-3 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              value={draft.maxTokens}
              onChange={(e) => update("maxTokens", parseInt(e.target.value) || 0)}
              min={1}
              max={128000}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
            <Input
              id="reasoningEffort"
              type="text"
              value={draft.reasoningEffort}
              onChange={(e) => update("reasoningEffort", e.target.value)}
              placeholder="e.g. low, medium, high, xhigh, max (blank = off)"
            />
            <p className="text-xs text-muted-foreground">
              How much the model thinks before answering. Blank uses the provider
              default. Setting it on a model that doesn't support it will fail.
            </p>
          </div>

          {draft.providerId !== "gemini" && draft.providerId !== "anthropic" && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.useLegacyChatCompletions}
                  onChange={(e) => update("useLegacyChatCompletions", e.target.checked)}
                  className="accent-primary"
                />
                Use old /chat/completions endpoint
              </label>
              <p className="text-xs text-muted-foreground">
                Uncheck to use the Responses API (<code>/responses</code>). Enable
                only if your endpoint does not support Responses.
              </p>
            </div>
          )}

          {proxyEnabled && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.proxyRequests}
                  onChange={(e) => update("proxyRequests", e.target.checked)}
                  className="accent-primary"
                />
                Proxy API requests through this server
              </label>
              <p className="text-xs text-muted-foreground">
                Routes provider calls through this deployment&apos;s <code>/proxy/</code>{" "}
                endpoint instead of calling the provider directly. Required for
                providers without browser CORS (e.g. OpenCode). Only available
                on self-hosted / dev deployments.
              </p>
            </div>
          )}

          {draft.providerId === "anthropic" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">Prompt Caching (Anthropic)</Label>
                <div className="space-y-1.5">
                  <Label>Cache TTL</Label>
                  <Select
                    value={draft.anthropicCacheTtl}
                    onValueChange={(value) => update("anthropicCacheTtl", value as "5m" | "1h")}
                    options={[
                      { value: "5m", label: "5 minutes" },
                      { value: "1h", label: "1 hour (2x write cost)" },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    5m refreshes for free within active bursts. Choose 1h only if
                    requests are often more than 5 minutes apart (e.g. resuming
                    a conversation after a pause) — cache writes cost 2x.
                  </p>
                </div>
              </div>
            </>
          )}

          {draft.providerId === "gemini" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">Prompt Caching (Gemini)</Label>
                <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enableCache}
                    onChange={(e) => update("enableCache", e.target.checked)}
                    className="accent-primary"
                  />
                  Enable Prompt Caching
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="recacheThreshold">Cache rebuild size (tokens)</Label>
                  <Input
                    id="recacheThreshold"
                    type="number"
                    value={draft.recacheThreshold}
                    onChange={(e) => update("recacheThreshold", parseInt(e.target.value) || 1024)}
                    min={1024}
                    max={65536}
                    step={1024}
                    disabled={!draft.enableCache}
                  />
                </div>
              </div>
            </>
          )}
        {currentPresetId === "custom" && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Custom Headers</Label>
                <CustomHeadersEditor
                  value={draft.customHeaders ?? {}}
                  onChange={(headers) => update("customHeaders", headers)}
                />
              </div>
            </>
          )}

        {currentPresetId === "openrouter" && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground">Sovereign AI (OpenRouter)</Label>
                <div className="space-y-1.5">
                  <Label>Inference region</Label>
                  <Select
                    value={draft.openRouterRegion ?? "global"}
                    onValueChange={(value) => handleRegionChange(value as "global" | "eu" | "us")}
                    options={[
                      { value: "global", label: "Global" },
                      { value: "eu", label: "EU" },
                      { value: "us", label: "US" },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Routes requests through the in-region endpoint (eu.openrouter.ai or
                    us.openrouter.ai) so prompts and completions never leave that region.
                    Requires a Business or Enterprise plan; the model list reloads from
                    the selected region.
                  </p>
                </div>
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      <ConnectionTest config={draft} />

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
        >
          Clean
        </Button>
        <Button
          size="sm"
          onClick={() => {
            apply();
            setApplied(true);
            setTimeout(() => setApplied(false), 2000);
          }}
        >
          {applied ? (
            <span>Applied!</span>
          ) : (
            "Apply"
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Your API key is stored locally and sent directly to the provider.
      </p>

      <div className="border border-border bg-muted/30 px-2.5 py-2 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
        <p>version v{APP_VERSION}</p>
        <p>build {BUILD_ID}</p>
        <a
          href="https://opendocbot.com/docs/license"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/50 hover:decoration-primary"
        >
          fair-code license
        </a>
      </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customInstructions">Custom Instructions</Label>
            <Textarea
              id="customInstructions"
              value={draft.customInstructions ?? ""}
              onChange={(e) => update("customInstructions", e.target.value)}
              placeholder="e.g. Always write in British English. Use a formal tone."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Persistent instructions injected into the agent's system prompt on
              every turn. They take precedence over conflicting built-in rules.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="maxIterations">Max Iterations</Label>
            <Input
              id="maxIterations"
              type="number"
              value={draft.maxIterations}
              onChange={(e) => update("maxIterations", parseInt(e.target.value) || 1)}
              min={1}
              max={999}
            />
            <p className="text-xs text-muted-foreground">
              Maximum agent-loop iterations per message before the loop aborts.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={draft.humanInTheLoop}
                onChange={(e) => update("humanInTheLoop", e.target.checked)}
                className="accent-primary"
              />
              Human in the Loop
            </label>
            <p className="text-xs text-muted-foreground">
              Require user approval for every document-modifying tool call.
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              Clean
            </Button>
            <Button
              size="sm"
              onClick={() => {
                apply();
                setApplied(true);
                setTimeout(() => setApplied(false), 2000);
              }}
            >
              {applied ? <span>Applied!</span> : "Apply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
