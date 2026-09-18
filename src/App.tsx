import { useEffect, useState } from "react";
import { isInsideOffice, useOfficeReady } from "./office";
import { Header } from "./components/layout/Header";
import { Taskpane } from "./components/layout/Taskpane";
import { ChatPanel } from "./components/chat/ChatPanel";
import { WelcomePanel } from "./components/chat/WelcomePanel";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { useChatStore } from "./store/chatStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTodoStore } from "./store/todoStore";
import { isConfigured } from "./lib/effectiveConfig";
import { getProvider } from "./providers/registry";
import { clearDebugLogs } from "./lib/debugLog";
import { stopGeneration } from "./chat/session";
import { clearSuggestions } from "./chat/suggestionRegistry";
import { resetSessionId } from "./lib/chatSession";
import { Toaster } from "@/components/ui/sonner";

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const config = useSettingsStore((s) => s.config);
  useOfficeReady();
  const inOffice = isInsideOffice();
  const configured = isConfigured(config);

  useEffect(() => {
    // The taskpane session ends when the pane closes. Give each provider a
    // chance to clean up server-side resources (e.g. delete the Gemini cache
    // so idle-storage billing stops).
    const flush = () => {
      const { providerId } = useSettingsStore.getState().config;
      getProvider(providerId)?.flushCache?.();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

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
