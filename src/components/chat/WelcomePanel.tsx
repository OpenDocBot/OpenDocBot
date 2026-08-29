import { Button } from "@/components/ui/button";
import logoUrl from "../../assets/logo.svg";

interface WelcomePanelProps {
  onConnect: () => void;
}

export function WelcomePanel({ onConnect }: WelcomePanelProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center font-mono">
      <img src={logoUrl} alt="OpenDocBot" className="h-10 w-auto" />
      <div className="space-y-2">
        <h1 className="text-base font-semibold text-foreground">
          Bring your own AI
        </h1>
        <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
          Connect OpenDocBot to the AI provider you already use. No sign-up, no
          intermediary.
        </p>
      </div>
      <Button size="lg" onClick={onConnect}>
        Connect a provider
      </Button>
      <p className="text-[11px] text-muted-foreground/70">
        Your API key is stored locally and sent directly to the provider.
      </p>
    </div>
  );
}