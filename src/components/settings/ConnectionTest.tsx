import { useState } from "react";
import { type ProviderConfig } from "../../store/settingsStore";
import { getProvider } from "../../providers/registry";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type TestStatus = "idle" | "testing" | "success" | "error";

interface ConnectionTestProps {
  config: ProviderConfig;
}

export function ConnectionTest({ config }: ConnectionTestProps) {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function testConnection() {
    if (!config.model) {
      setErrorMsg("Select a model first — the test was skipped (no model was sent).");
      setStatus("error");
      return;
    }

    const provider = getProvider(config.providerId);

    setStatus("testing");
    setLatency(null);
    setErrorMsg(null);

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
        }
      );
      setLatency(Math.round(performance.now() - start));
      setStatus("success");
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
    </div>
  );
}
