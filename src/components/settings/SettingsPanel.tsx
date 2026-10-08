import { useEffect, useState } from "react";
import { useSettingsStore, type ProviderConfig } from "../../store/settingsStore";
import { getEffectiveConfig, useForcedKeys } from "../../lib/effectiveConfig";
import { useManagedConfigStore } from "../../store/managedConfigStore";
import { PresetSelector, matchPreset, getPreset } from "./PresetSelector";
import { normalizeFoundryEndpoint } from "../../lib/foundryEndpoint";
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

/** Loose AWS region id check (us-east-1, eu-north-1, us-gov-west-1, ...). */
const BEDROCK_REGION_RE = /^[a-z]{2}(-gov)?-[a-z0-9-]+-\d$/;

/** Common Tesseract language codes for scanned-PDF OCR (single-select). */
const OCR_LANGUAGE_OPTIONS = [
  { value: "eng", label: "English" },
  { value: "spa", label: "Spanish" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" },
  { value: "ita", label: "Italian" },
  { value: "por", label: "Portuguese" },
  { value: "nld", label: "Dutch" },
  { value: "rus", label: "Russian" },
  { value: "ukr", label: "Ukrainian" },
  { value: "pol", label: "Polish" },
  { value: "ces", label: "Czech" },
  { value: "swe", label: "Swedish" },
  { value: "ron", label: "Romanian" },
  { value: "tur", label: "Turkish" },
  { value: "ara", label: "Arabic" },
  { value: "heb", label: "Hebrew" },
  { value: "ell", label: "Greek" },
  { value: "hin", label: "Hindi" },
  { value: "vie", label: "Vietnamese" },
  { value: "ind", label: "Indonesian" },
  { value: "tha", label: "Thai" },
  { value: "chi_sim", label: "Chinese (Simplified)" },
  { value: "chi_tra", label: "Chinese (Traditional)" },
  { value: "jpn", label: "Japanese" },
  { value: "kor", label: "Korean" },
];

function useDraftConfig() {
  const store = useSettingsStore();
  const forcedKeys = useForcedKeys();
  const managed = useManagedConfigStore((s) => s.payload?.managedConfig ?? null);
  const [draft, setDraft] = useState<ProviderConfig>(() =>
    getEffectiveConfig(store.config, managed)
  );

  // Re-seed the draft when the managed config changes (e.g. after a manual
  // refresh), so the form reflects the new forced values. Any unsaved local
  // edits are discarded, which is expected for a refresh.
  useEffect(() => {
    // Syncing the draft to an external (managed) config change is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(getEffectiveConfig(useSettingsStore.getState().config, managed));
  }, [managed]);

  function update<K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) {
    // A key forced by the managed config cannot be edited; ignore the change so
    // the disabled control can never mutate the draft.
    if (forcedKeys.includes(key)) return;
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    // Forced keys are owned by the managed config: never copy them into the
    // local store, so the user's own value survives if the instance is later
    // un-managed.
    if (!forcedKeys.includes("presetId")) store.setPresetId(draft.presetId ?? "");
    if (!forcedKeys.includes("apiKey")) store.setApiKey(draft.apiKey);
    if (!forcedKeys.includes("model")) store.setModel(draft.model);
    if (!forcedKeys.includes("baseUrl")) store.setBaseUrl(draft.baseUrl);
    if (!forcedKeys.includes("maxTokens")) store.setMaxTokens(draft.maxTokens);
    if (!forcedKeys.includes("providerId")) store.setProviderId(draft.providerId);
    if (!forcedKeys.includes("enableCache")) store.setEnableCache(draft.enableCache);
    if (!forcedKeys.includes("recacheThreshold")) store.setRecacheThreshold(draft.recacheThreshold);
    if (!forcedKeys.includes("useLegacyChatCompletions")) store.setUseLegacyChatCompletions(draft.useLegacyChatCompletions);
    if (!forcedKeys.includes("reasoningEffort")) store.setReasoningEffort(draft.reasoningEffort);
    if (!forcedKeys.includes("proxyRequests")) store.setProxyRequests(draft.proxyRequests);
    if (!forcedKeys.includes("anthropicCacheTtl")) store.setAnthropicCacheTtl(draft.anthropicCacheTtl);
    if (!forcedKeys.includes("humanInTheLoop")) store.setHumanInTheLoop(draft.humanInTheLoop);
    if (!forcedKeys.includes("suggestionMode")) store.setSuggestionMode(draft.suggestionMode);
    if (!forcedKeys.includes("maxIterations")) store.setMaxIterations(draft.maxIterations);
    if (!forcedKeys.includes("customInstructions")) store.setCustomInstructions(draft.customInstructions ?? "");
    if (!forcedKeys.includes("customHeaders")) store.setCustomHeaders(draft.customHeaders ?? {});
    if (!forcedKeys.includes("openRouterRegion")) store.setOpenRouterRegion(draft.openRouterRegion);
    if (!forcedKeys.includes("bedrockRegion")) store.setBedrockRegion(draft.bedrockRegion);
    if (!forcedKeys.includes("ocrLanguage")) store.setOcrLanguage(draft.ocrLanguage ?? "eng");
    return true;
  }

  function reset() {
    setDraft(getEffectiveConfig(store.config, managed));
  }

  return { draft, update, apply, reset, forcedKeys, managed: Boolean(managed) };
}

export function SettingsPanel() {
  const { draft, update, apply, reset, forcedKeys, managed } = useDraftConfig();
  const [activeTab, setActiveTab] = useState<"connection" | "behavior">("connection");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const isForced = (key: keyof ProviderConfig) => forcedKeys.includes(key);

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
    if (preset.defaultRegion) update("bedrockRegion", preset.defaultRegion);
    // Proxy routing is provider-specific; don't carry it across presets.
    update("proxyRequests", false);
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

      {managed && (
        <div className="border border-border bg-muted/30 px-2.5 py-2 font-mono text-xs text-muted-foreground">
          Managed by your administrator. Some settings cannot be changed.
        </div>
      )}

      {activeTab === "connection" && (
        <>
      <PresetSelector
        baseUrl={draft.baseUrl}
        model={draft.model}
        presetId={draft.presetId}
        onChange={handlePresetChange}
        disabled={isForced("presetId")}
      />

      {currentPresetId === "custom" && (
        <ProviderSelect
          value={draft.providerId}
          onChange={(id) => update("providerId", id)}
          disabled={isForced("providerId")}
        />
      )}

      {currentPresetId !== "bedrock" && (
        <div className="space-y-1.5">
          <Label htmlFor="endpoint">Endpoint URL</Label>
          <Input
            id="endpoint"
            value={draft.baseUrl}
            onChange={(e) => {
              const raw = e.target.value;
              // Foundry: any resource URL (root, /models, /models/chat/…, a full
              // completion URL) normalizes to the canonical `/openai/v1` base.
              update(
                "baseUrl",
                currentPresetId === "foundry" ? normalizeFoundryEndpoint(raw) : raw
              );
            }}
            onBlur={() => {
              if (currentPresetId === "foundry") {
                const normalized = normalizeFoundryEndpoint(draft.baseUrl);
                if (normalized !== draft.baseUrl) update("baseUrl", normalized);
              }
            }}
            placeholder={currentPreset?.endpointPlaceholder ?? "https://api.openai.com/v1"}
            disabled={isForced("baseUrl")}
          />
          {currentPresetId === "foundry" && (
            <p className="text-xs text-muted-foreground">
              Paste the endpoint from the Foundry portal.
            </p>
          )}
        </div>
      )}

      {currentPresetId === "bedrock" && (
        <div className="space-y-1.5">
          <Label htmlFor="bedrockRegion">Region</Label>
          <Input
            id="bedrockRegion"
            value={draft.bedrockRegion}
            onChange={(e) => update("bedrockRegion", e.target.value)}
            placeholder="eu-north-1"
            disabled={isForced("bedrockRegion")}
          />
          {draft.bedrockRegion && !BEDROCK_REGION_RE.test(draft.bedrockRegion) && (
            <p className="text-xs text-amber-500">
              Expected an AWS region id such as us-east-1 or eu-north-1.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="apiKey">API Key {!requiresKey && <span className="text-muted-foreground">(optional)</span>}</Label>
        <Input
          id="apiKey"
          type="password"
          autoComplete="new-password"
          value={draft.apiKey}
          onChange={(e) => update("apiKey", e.target.value)}
          placeholder={currentPreset?.keyPlaceholder ?? "sk-..."}
          disabled={isForced("apiKey")}
        />
      </div>

      <ModelSelector
        apiKey={draft.apiKey}
        model={draft.model}
        baseUrl={draft.baseUrl}
        providerId={draft.providerId}
        proxyRequests={draft.proxyRequests}
        region={draft.bedrockRegion}
        allowCustomModel={currentPresetId === "bedrock"}
        manualModel={currentPresetId === "foundry"}
        onChange={(model) => update("model", model)}
        filterFree={currentPresetId === "openrouter"}
        disabled={isForced("model")}
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
              disabled={isForced("maxTokens")}
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
              disabled={isForced("reasoningEffort")}
            />
            <p className="text-xs text-muted-foreground">
              How much the model thinks before answering. Blank uses the provider
              default. Setting it on a model that doesn't support it will fail.
            </p>
          </div>

          {draft.providerId !== "gemini" && draft.providerId !== "anthropic" && draft.providerId !== "bedrock" && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 font-mono text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.useLegacyChatCompletions}
                  onChange={(e) => update("useLegacyChatCompletions", e.target.checked)}
                  className="accent-primary"
                  disabled={isForced("useLegacyChatCompletions")}
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
                  disabled={isForced("proxyRequests")}
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
                    disabled={isForced("anthropicCacheTtl")}
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
                    disabled={isForced("enableCache")}
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
                    disabled={!draft.enableCache || isForced("recacheThreshold")}
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
                  disabled={isForced("customHeaders")}
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
                    disabled={isForced("openRouterRegion")}
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
        </>
        )}

        {activeTab === "behavior" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customInstructions">Custom Instructions</Label>
            <Textarea
              id="customInstructions"
              value={draft.customInstructions ?? ""}
              onChange={(e) => update("customInstructions", e.target.value)}
              placeholder="e.g. Always write in British English. Use a formal tone."
              rows={3}
              disabled={isForced("customInstructions")}
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
              disabled={isForced("maxIterations")}
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
                disabled={isForced("humanInTheLoop")}
              />
              Human in the Loop
            </label>
            <p className="text-xs text-muted-foreground">
              Require user approval for every document-modifying tool call.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="ocrLanguage">OCR Language</Label>
            <Select
              value={draft.ocrLanguage ?? "eng"}
              onValueChange={(value) => update("ocrLanguage", value)}
              options={OCR_LANGUAGE_OPTIONS}
              disabled={isForced("ocrLanguage")}
            />
            <p className="text-xs text-muted-foreground">
              Language used for scanned-PDF OCR.
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

      <div className="border border-border bg-muted/30 px-2.5 py-2 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
        <p>version v{APP_VERSION}</p>
        <p>build {BUILD_ID}</p>
        <p>
          <a
            href="https://github.com/OpenDocBot/OpenDocBot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/50 hover:decoration-primary"
          >
            Source Code
          </a>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          <a
            href="https://github.com/OpenDocBot/OpenDocBot/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/50 hover:decoration-primary"
          >
            License
          </a>
        </p>
      </div>
    </div>
  );
}
