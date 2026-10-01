import { useEffect, useState } from "react";
import { isInsideOffice, useOfficeReady } from "./office";
import { Header } from "./components/layout/Header";
import { Taskpane } from "./components/layout/Taskpane";
import { ChatPanel } from "./components/chat/ChatPanel";
import { WelcomePanel } from "./components/chat/WelcomePanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { useChatStore } from "./store/chatStore";
import { useTodoStore } from "./store/todoStore";
import { isConfigured, useEffectiveConfig, getEffectiveConfigState } from "./lib/effectiveConfig";
import { getProvider } from "./providers/registry";
import { clearDebugLogs } from "./lib/debugLog";
import { stopGeneration } from "./chat/session";
import { clearSuggestions } from "./chat/suggestionRegistry";
import { resetSessionId } from "./lib/chatSession";
import { Toaster } from "@/components/ui/sonner";
import { SignInGate } from "./components/auth/SignInGate";
import { useAuthStore } from "./store/authStore";

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const config = useEffectiveConfig();
  const authStatus = useAuthStore((s) => s.status);
  useOfficeReady();
  const inOffice = isInsideOffice();
  const configured = isConfigured(config);

  useEffect(() => {
    // The taskpane session ends when the pane closes. Give each provider a
    // chance to clean up server-side resources (e.g. delete the Gemini cache
    // so idle-storage billing stops).
    const flush = () => {
      const { providerId } = getEffectiveConfigState();
      getProvider(providerId)?.flushCache?.();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // A managed instance that requires sign-in gates the whole taskpane.
  if (authStatus === "signedOut") {
    return (
      <>
        <SignInGate />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Taskpane
        header={
          <Header
            showSettings={showSettings}
            onToggleSettings={() => setShowSettings((s) => !s)}
            configured={configured}
            onClearChat={() => { stopGeneration(); clearMessages(); clearDebugLogs(); resetSessionId(); useTodoStore.getState().clearTodos(); clearSuggestions(); }}
          />
        }
      >
        {!inOffice && !showSettings && (
          <div className="mx-3 mt-2 px-2.5 py-1.5 font-mono text-xs bg-amber-950/60 border border-amber-800/60 text-amber-400">
            <span className="text-amber-600 select-none mr-1.5">⚠</span>
            Browser dev mode — Office.js not detected. Tools return sample data.
          </div>
        )}
        {showSettings ? (
          <SettingsPanel />
        ) : configured ? (
          <ChatPanel />
        ) : (
          <WelcomePanel onConnect={() => setShowSettings(true)} />
        )}
      </Taskpane>
      <Toaster />
    </>
  );
}

export default App;
