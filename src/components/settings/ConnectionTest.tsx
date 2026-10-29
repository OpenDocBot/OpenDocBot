import { useState } from "react";
import { type ProviderConfig } from "../../store/settingsStore";
import { getProvider } from "../../providers/registry";
import { getPresetInfo } from "../../lib/effectiveConfig";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

type TestStatus = "idle" | "testing" | "success" | "error";

const ENTERPRISE_HINT_KEY = "opendocbot-enterprise-hint-seen";

function hasSeenEnterpriseHint(): boolean {
  try {
    return localStorage.getItem(ENTERPRISE_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function markEnterpriseHintSeen() {
  try {
    localStorage.setItem(ENTERPRISE_HINT_KEY, "1");
  } catch {
    // Ignore storage failures (private mode, blocked storage).
  }
}

interface ConnectionTestProps {
  config: ProviderConfig;
  showEnterpriseHint?: boolean;
}

export function ConnectionTest({ config, showEnterpriseHint = true }: ConnectionTestProps) {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [enterpriseHintVisible, setEnterpriseHintVisible] = useState(false);
  const [enterpriseHintPreset, setEnterpriseHintPreset] = useState<string | null>(null);
  const presetId = getPresetInfo(config).presetId;
  const hintVisible =
    showEnterpriseHint &&
    enterpriseHintVisible &&
    enterpriseHintPreset === presetId &&
    status === "success";

  async function testConnection() {
    if (!config.model) {
      setErrorMsg("Select a model first — the test was skipped (no model was sent).");
      setStatus("error");
      return;
    }

    const provider = getProvider(config.providerId);
    // Custom headers only apply to the Custom preset (matches useChat).
    const customHeaders =
      getPresetInfo(config).presetId === "custom"
        ? config.customHeaders
        : undefined;

    setStatus("testing");
    setLatency(null);
    setErrorMsg(null);
    setEnterpriseHintVisible(false);
    setEnterpriseHintPreset(null);

    const start = performance.now();
    try {
      await provider.chat(
        [{ role: "user", content: "Hello" }],
        [],
        {
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl || undefined,
          maxTokens: 10,
          useLegacyChatCompletions: config.useLegacyChatCompletions,
          reasoningEffort: config.reasoningEffort,
          proxyRequests: config.proxyRequests,
          cacheTtl: config.anthropicCacheTtl,
          customHeaders,
          region: config.bedrockRegion,
        }
      );
      setLatency(Math.round(performance.now() - start));
      setStatus("success");

      const isEnterpriseProvider = presetId === "bedrock" || presetId === "foundry";
      if (showEnterpriseHint && isEnterpriseProvider && !hasSeenEnterpriseHint()) {
        setEnterpriseHintVisible(true);
        setEnterpriseHintPreset(presetId ?? null);
        markEnterpriseHintSeen();
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2 font-mono">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={testConnection}
          disabled={status === "testing"}
        >
          {status === "testing" && (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          )}
          Test Connection
        </Button>
        {status === "success" && (
          <span className="text-xs text-primary">
            Connected ({latency}ms)
          </span>
        )}
        {status === "error" && (
          <span className="text-xs text-destructive">
            Failed
          </span>
        )}
      </div>
      {errorMsg && (
        <div className="border border-destructive/30 bg-black/40 p-2.5 max-h-40 overflow-y-auto">
          <pre className="text-xs text-destructive font-mono whitespace-pre-wrap break-all m-0">{errorMsg}</pre>
        </div>
      )}
      {hintVisible && (
        <div className="flex items-start justify-between gap-2 border border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
          <span>
            Using OpenDocBot with a team?{" "}
            <a
              href="https://opendocbot.com/enterprise"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setEnterpriseHintVisible(false)}
              className="text-primary underline decoration-primary/50 hover:decoration-primary"
            >
              Enterprise use
            </a>
          </span>
          <button
            type="button"
            onClick={() => setEnterpriseHintVisible(false)}
            aria-label="Dismiss enterprise hint"
            title="Dismiss"
            className="shrink-0 text-muted-foreground/70 hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
