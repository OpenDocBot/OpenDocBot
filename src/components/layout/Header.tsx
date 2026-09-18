import { MessageSquareText, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "../../store/settingsStore";
import { getHost } from "../../office";
import logoMarkUrl from "../../assets/logo-mark.svg";
import { APP_VERSION, BUILD_ID } from "../../lib/buildInfo";

interface HeaderProps {
  showSettings: boolean;
  onToggleSettings: () => void;
  onClearChat: () => void;
  configured: boolean;
}

export function Header({ showSettings, onToggleSettings, onClearChat, configured }: HeaderProps) {
  const suggestionMode = useSettingsStore((s) => s.config.suggestionMode);
  const setSuggestionMode = useSettingsStore((s) => s.setSuggestionMode);
  // Suggestion mode only exists in Word and Excel.
  const suggestionAvailable = getHost() !== "powerpoint";

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <img src={logoMarkUrl} alt="OpenDocBot" className="h-6 w-auto shrink-0" />
        <Badge variant="secondary" className="text-[10px]" title={`build ${BUILD_ID}`}>
          v{APP_VERSION}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {suggestionAvailable && configured && (
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
        {configured && (
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
        <Button
          variant={showSettings ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleSettings}
          className="h-7 w-7"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
