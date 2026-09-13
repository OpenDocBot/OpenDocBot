import { useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ApiKeyInput() {
  const apiKey = useSettingsStore((s) => s.config.apiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="apiKey">API Key</Label>
      <div className="relative">
        <Input
          id="apiKey"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="pr-16"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-[11px] text-muted-foreground"
          tabIndex={-1}
        >
          {showKey ? "Hide" : "Show"}
        </Button>
      </div>
    </div>
  );
}
