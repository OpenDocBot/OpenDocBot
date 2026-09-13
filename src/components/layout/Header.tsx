import { Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import logoMarkUrl from "../../assets/logo-mark.svg";
import { APP_VERSION, BUILD_ID } from "../../lib/buildInfo";

interface HeaderProps {
  showSettings: boolean;
  onToggleSettings: () => void;
  onClearChat: () => void;
}

export function Header({ showSettings, onToggleSettings, onClearChat }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <img src={logoMarkUrl} alt="OpenDocBot" className="h-6 w-auto shrink-0" />
        <Badge variant="secondary" className="text-[10px]" title={`build ${BUILD_ID}`}>
          v{APP_VERSION}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearChat}
          className="h-7 w-7"
          title="Clear conversation"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
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
