import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn } from "../../lib/auth";
import { refreshManagedConfig } from "../../lib/managedConfigBootstrap";
import logoUrl from "../../assets/logo.svg";

/**
 * Full-app gate shown on a managed instance that requires sign-in. It replaces
 * the whole taskpane (header included) until a valid session exists.
 */
export function SignInGate() {
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      await signIn();
      await refreshManagedConfig();
    } catch (err) {
      toast.error(`Sign-in failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center font-mono">
      <img src={logoUrl} alt="OpenDocBot" className="h-10 w-auto" />
      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Sign in required
        </h2>
        <p className="max-w-xs text-xs text-muted-foreground">
          This instance is managed. Sign in with your organization account to
          continue.
        </p>
      </div>
      <Button onClick={handleSignIn} disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
    </div>
  );
}
