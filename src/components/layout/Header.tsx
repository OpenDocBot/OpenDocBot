import { useState } from "react";
import { Check, FileCog, MessageSquareText, RefreshCw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "../../store/settingsStore";
import { useManagedConfigStore } from "../../store/managedConfigStore";
import { useEffectiveConfig, useConfigSource } from "../../lib/effectiveConfig";
import { refreshManagedConfig } from "../../lib/managedConfigBootstrap";
import { getHost } from "../../office";
import { ConfigTransferDialog } from "../settings/ConfigTransferDialog";
import logoMarkUrl from "../../assets/logo-mark.svg";
import { APP_VERSION, BUILD_ID } from "../../lib/buildInfo";

interface HeaderProps {
  showSettings: boolean;
  onToggleSettings: () => void;
  onClearChat: () => void;
  configured: boolean;
}

export function Header({ showSettings, onToggleSettings, onClearChat, configured }: HeaderProps) {
  const config = useEffectiveConfig();
  const suggestionMode = config.suggestionMode;
  const setSuggestionMode = useSettingsStore((s) => s.setSuggestionMode);
  // Config export/import is unavailable while an instance forces the config:
  // the managed keys are not the user's to share.
  const managed = useConfigSource() === "managed";
  // Managed deployment (from the bootstrap marker), even if the config has not
  // loaded: keeps the refresh button available as a retry.
  const managedInstance = useManagedConfigStore((s) => s.managedInstance);
  // Suggestion mode only exists in Word and Excel.
  const suggestionAvailable = getHost() !== "powerpoint";
  const [transferOpen, setTransferOpen] = useState(false);
  // Re-fetches the instance's managed config from the server. Success is shown
  // on the button itself; a failure surfaces as an error toast.
  const [refreshState, setRefreshState] = useState<"idle" | "refreshing" | "done">("idle");

  async function handleRefresh() {
    if (refreshState === "refreshing") return;
    setRefreshState("refreshing");
    try {
      const outcome = await refreshManagedConfig();
      if (outcome === "managed") {
        setRefreshState("done");
        window.setTimeout(() => setRefreshState("idle"), 1500);
        return;
      }
      if (outcome === "unavailable") {
        toast.error("Could not refresh the managed configuration.");
      }
    } catch {
      toast.error("Could not refresh the managed configuration.");
    }
    setRefreshState("idle");
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <img src={logoMarkUrl} alt="OpenDocBot" className="h-6 w-auto shrink-0" />
        <Badge variant="secondary" className="text-[10px]" title={`build ${BUILD_ID}`}>
          v{APP_VERSION}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {!showSettings && suggestionAvailable && configured && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSuggestionMode(!suggestionMode)}
            className={cn(
              "h-7 w-7",
              suggestionMode && "bg-accent text-accent-foreground"
            )}
            title="Suggestion mode: the agent adds review comments instead of editing."
            aria-pressed={suggestionMode}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
          </Button>
        )}
        {!showSettings && configured && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearChat}
            className="h-7 w-7"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
        {showSettings && !managed && (
          <Button
            variant={transferOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setTransferOpen((open) => !open)}
            className="h-7 w-7"
            title="Export / import settings"
          >
            <FileCog className="w-3.5 h-3.5" />
          </Button>
        )}
        {showSettings && managedInstance && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshState === "refreshing"}
            className="h-7 w-7"
            title="Refresh managed configuration"
            data-state={refreshState}
          >
            {refreshState === "done" ? (
              <Check className="w-3.5 h-3.5 text-primary" />
            ) : (
              <RefreshCw
                className={cn("w-3.5 h-3.5", refreshState === "refreshing" && "animate-spin")}
              />
            )}
          </Button>
        )}
        <Button
          variant={showSettings ? "secondary" : "ghost"}
          size="icon"
          onClick={() => {
            setTransferOpen(false);
            onToggleSettings();
          }}
          className="h-7 w-7"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </div>
      {transferOpen && <ConfigTransferDialog onClose={() => setTransferOpen(false)} />}
    </div>
  );
}
