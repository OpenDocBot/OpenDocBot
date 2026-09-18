import { useCallback } from "react";
import { useChatStore } from "../store/chatStore";
import { useSettingsStore } from "../store/settingsStore";
import { getProvider } from "../providers/registry";
import { isConfigured, getPresetInfo } from "../lib/effectiveConfig";
import { runAgentLoop } from "./agentLoop";
import { debugLog } from "../lib/debugLog";
import type { Attachment } from "./types";
import {
  setAbortController,
  setApprovalResolver,
  resolvePendingApproval,
  stopGeneration,
  getRejectedThisTurn,
  setRejectedThisTurn,
  resetSession,
} from "./session";
import { WRITE_TOOLS } from "./writeTools";

export function useChat() {
  const settings = useSettingsStore((s) => s.config);
  const {
    addUserMessage,
    addAssistantPlaceholder,
    appendToken,
    appendReasoning,
    finalizeMessage,
    setThinking,
    setCurrentTool,
    addToolStatusMessage,
    markLastToolDone,
    setActiveQuestions,
    setPendingApproval,
    setError,
    setModelHistory,
    clearAttachments,
  } = useChatStore();

  const resolveApproval = useCallback(
    (approved: boolean) => {
      if (!approved) {
        setRejectedThisTurn(true);
      }
      resolvePendingApproval(approved);
      setPendingApproval(null);
    },
    [setPendingApproval]
  );

  const stopMessage = useCallback(() => {
    stopGeneration();
    setPendingApproval(null);
  }, [setPendingApproval]);

  const sendMessage = useCallback(
    async (
      text: string,
      docState?: string,
      attachments?: Attachment[]
    ): Promise<void> => {
      const provider = getProvider(settings.providerId);
      if (!isConfigured(settings)) {
        setError("No provider connected yet — open Settings to configure your endpoint, model, and API key.");
        return;
      }

      const history = useChatStore.getState().modelHistory;

      // Custom headers are a Custom-preset feature: only send them when the
      // active preset is Custom (so a preset switch never leaks them).
      const customHeaders =
        getPresetInfo(settings).presetId === "custom"
          ? settings.customHeaders
          : undefined;

      const controller = new AbortController();
      setAbortController(controller);

      setError(null);
      setActiveQuestions(null);
      addUserMessage(text, attachments);
      clearAttachments();

      const userMessage = text;
      setRejectedThisTurn(false);

      // Placeholder: created only when first content token arrives (not during reasoning)
      const currentId = { value: null as string | null };
      let batchContent = "";
      let totalClean = "";
      let tokenBuffer = "";
      let reasoningBuffer = "";
      let reasoningFlushed = false;
      let toolStarted = false;

      try {
        debugLog("info", `Agent loop starting (model=${settings.model})`);
        const t0 = performance.now();
        const result = await runAgentLoop(provider, userMessage, {
          apiKey: settings.apiKey,
          model: settings.model,
          baseUrl: settings.baseUrl || undefined,
          maxTokens: settings.maxTokens,
          signal: controller.signal,
          enableCache: settings.enableCache,
          recacheThreshold: settings.recacheThreshold,
          useLegacyChatCompletions: settings.useLegacyChatCompletions,
          reasoningEffort: settings.reasoningEffort,
          proxyRequests: settings.proxyRequests,
          cacheTtl: settings.anthropicCacheTtl,
          customHeaders,
          // DeepSeek thinking mode requires reasoning_content echoed back on
          // every assistant message; the DeepSeek preset enables the echo.
          echoReasoningContent: settings.presetId === "deepseek",
        }, {
          onReasoningToken: (token) => {
            reasoningBuffer += token;
            if (!currentId.value) {
              const msg = addAssistantPlaceholder();
              currentId.value = msg.id;
            }
            appendReasoning(currentId.value, token);
          },
          onToken: (rawToken) => {
            if (!reasoningFlushed) {
              reasoningFlushed = true;
              if (!currentId.value) {
                const msg = addAssistantPlaceholder();
                currentId.value = msg.id;
                if (reasoningBuffer) {
                  appendReasoning(currentId.value, reasoningBuffer);
                }
              }
            }
            tokenBuffer += rawToken;
            const cleaned = tokenBuffer
              .replace(/<function-calls>[\s\S]*?<\/function-calls>/g, "")
              .replace(/<tool_calls>[\s\S]*?<\/tool_calls>/g, "")
              .replace(/<tools>[\s\S]*?<\/tools>/g, "");
            if (cleaned.length > totalClean.length) {
              const newText = cleaned.substring(totalClean.length);
              totalClean = cleaned;
              batchContent += newText;
              if (!currentId.value) {
                const msg = addAssistantPlaceholder();
                currentId.value = msg.id;
              }
              appendToken(currentId.value, newText);
              setThinking(currentId.value, false);
            }
          },
          onToolStart: (name, label) => {
            toolStarted = true;
            if (batchContent && currentId.value) {
              finalizeMessage(currentId.value, batchContent);
              currentId.value = null;
              batchContent = "";
            }
            addToolStatusMessage(name, label);
            setCurrentTool(name);
          },
          onToolEnd: () => {
            const current = useChatStore.getState().currentToolName;
            if (current) markLastToolDone();
            setCurrentTool(null);
          },
          onToolApproval: settings.humanInTheLoop
            ? (tc, args) => {
                if (!WRITE_TOOLS.has(tc.function.name)) {
                  return Promise.resolve(true);
                }
                if (getRejectedThisTurn()) {
                  return Promise.resolve(false);
                }
                return new Promise<boolean>((resolve) => {
                  setApprovalResolver(resolve);
                  setPendingApproval({
                    toolName: tc.function.name,
                    label: (args.action_description as string | undefined) ||
                      tc.function.name,
                    args,
                  });
                });
              }
            : undefined,
          onAskUserQuestion: (questions) => {
            setActiveQuestions(questions);
          },
          onHistoryChange: (msgs) => {
            setModelHistory(msgs.filter((m) => m.role !== "system"));
          },
          onProviderFinish: (info) => {
            debugLog("info", `Provider finish: ${info.finishReason}`);
            if (info.finishReason === "length") {
              const note =
                "The model's reply was cut off because it reached the output token limit. " +
                "Increase Max Tokens in Settings and try again.";
              if (currentId.value) {
                appendToken(currentId.value, `\n\n> ${note}`);
              } else {
                const msg = addAssistantPlaceholder();
                currentId.value = msg.id;
                appendToken(currentId.value, note);
                setThinking(msg.id, false);
              }
            }
          },
        }, history, docState, settings.customInstructions || "", settings.maxIterations, attachments, settings.suggestionMode);

        debugLog("info", `Agent loop finished (${Math.round(performance.now() - t0)}ms, ${result.iterations} iter, finish=${result.finishReason})`);

        if (result.finishReason === "max_iterations") {
          throw new Error(`Agent loop exceeded ${settings.maxIterations} iterations`);
        }

        // Guard: if the loop produced no assistant content and executed no tool
        // calls, surface a visible note instead of silent nothing. (Tool turns
        // like ask_user_question reset the streaming state, so they must not
        // trigger this guard.)
        if (!currentId.value && !batchContent && !toolStarted && result.finishReason === "stop") {
          const msg = addAssistantPlaceholder();
          currentId.value = msg.id;
          const note =
            "The model returned an empty response. This can happen if it hit the " +
            "output token limit, the provider stalled, or the request was malformed. " +
            "Try again, or increase Max Tokens in Settings.";
          appendToken(currentId.value, note);
          setThinking(currentId.value, false);
          debugLog("info", "Empty result guard: added visible note");
        }

        if (currentId.value && batchContent) {
          finalizeMessage(currentId.value, batchContent);
        }
        resetSession();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          debugLog("info", "Agent loop aborted by user");
          if (currentId.value && batchContent) {
            finalizeMessage(currentId.value, batchContent);
          }
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          debugLog("error", `Agent loop failed: ${msg}`);
          setError(msg);
        }
        resetSession();
      }
    },
    [
      settings,
      addUserMessage,
      addAssistantPlaceholder,
      appendToken,
      appendReasoning,
      finalizeMessage,
      setThinking,
      setCurrentTool,
      addToolStatusMessage,
      markLastToolDone,
      setActiveQuestions,
      setPendingApproval,
      setError,
      setModelHistory,
      clearAttachments,
    ]
  );

  return { sendMessage, stopMessage, resolveApproval };
}
