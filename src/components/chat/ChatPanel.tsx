import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../store/chatStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useChat } from "../../chat/useChat";
import { useOfficeReady, getHost } from "../../office";
import { buildDocState, buildUserSelection } from "../../tools";
import { debugLog, formatDebugLogs } from "../../lib/debugLog";
import { getPresetInfo } from "../../lib/effectiveConfig";
import { APP_VERSION, BUILD_ID } from "../../lib/buildInfo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "./Markdown";
import QuestionCard from "./QuestionCard";
import ApprovalCard from "./ApprovalCard";
import TodoPanel from "./TodoPanel";
import { AttachmentQueue } from "./AttachmentQueue";
import { useAttachments } from "./useAttachments";
import { useFileDrop } from "./useFileDrop";
import { ATTACHMENT_ACCEPT } from "../../chat/attachments/config";
import { Copy, Loader2, Paperclip, Square } from "lucide-react";
import logoUrl from "../../assets/logo.svg";

const EMPTY_STATE_COPY: Record<ReturnType<typeof getHost>, { title: string; hint: string }> = {
  word: {
    title: "Write, edit, or format this document.",
    hint: "Just describe what you want.",
  },
  excel: {
    title: "Analyze, write, or format your data.",
    hint: "Just describe what you want.",
  },
  powerpoint: {
    title: "Build, edit, or polish your slides.",
    hint: "Just describe what you want.",
  },
};

function formatConversation(
  messages: ReturnType<typeof useChatStore.getState>["messages"],
  config: ReturnType<typeof useSettingsStore.getState>["config"]
): string {
  const lines: string[] = [];

  let userCount = 0;
  let assistantCount = 0;

  for (const msg of messages) {
    if (msg.role === "user") userCount++;
    else if (msg.role === "assistant") assistantCount++;
  }

  lines.push("# OpenDocBot Debug Export");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Version | v${APP_VERSION} |`);
  lines.push(`| Build | ${BUILD_ID} |`);
  lines.push(`| Provider | ${config.providerId} |`);
  lines.push(`| Preset | ${getPresetInfo(config).presetId} |`);
  const headerNames = Object.keys(config.customHeaders ?? {})
    .map((k) => k.trim())
    .filter(Boolean);
  lines.push(`| Custom Headers | ${headerNames.length > 0 ? headerNames.join(", ") : "none"} |`);
  lines.push(`| Messages | ${messages.length} |`);
  lines.push(`| User messages | ${userCount} |`);
  lines.push(`| Assistant messages | ${assistantCount} |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  const debugSection = formatDebugLogs();
  if (debugSection) {
    lines.push(debugSection);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "## User" : "## Assistant";
    const ts = new Date(msg.timestamp).toISOString();

    lines.push(`${roleLabel} \`${ts}\``);
    lines.push("");

    if ("reasoning" in msg && msg.reasoning) {
      lines.push("<details>");
      lines.push("<summary>Reasoning</summary>");
      lines.push("");
      lines.push(msg.reasoning);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }

    if (msg.content) {
      lines.push(msg.content);
      lines.push("");
    }

    if ("toolCalls" in msg && msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push("**Tool calls:**");
      for (const tc of msg.toolCalls) {
        let argsStr = "";
        try {
          const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
          argsStr = JSON.stringify(args);
          if (argsStr.length > 200) argsStr = argsStr.slice(0, 200) + "…";
        } catch { /* ignore */ }
        lines.push(`- \`${tc.function.name}\` ${argsStr}`);
      }
      lines.push("");
    }

    if (!msg.content && (!("toolCalls" in msg) || !msg.toolCalls || msg.toolCalls.length === 0)) {
      lines.push("*(no content)*");
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const { messages, isLoading, error, activeToolLabel, activeQuestions, setActiveQuestions, pendingApproval } = useChatStore();
  const { sendMessage, stopMessage, resolveApproval } = useChat();
  const { setLoading } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const officeReady = useOfficeReady();
  const { attachments, addFiles } = useAttachments();
  const { isDragging, handlers } = useFileDrop(addFiles);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [stopHover, setStopHover] = useState(false);
  const hasReadyAttachments = attachments.some((a) => a.status === "ready");
  const isExtractingAttachments = attachments.some(
    (a) => a.status === "extracting" || a.status === "ocr"
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    debugLog("info", `isLoading → ${isLoading}`);
  }, [isLoading]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleCopy() {
    const text = formatConversation(messages, useSettingsStore.getState().config);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSend(options?: { textOverride?: string }) {
    const text = (options?.textOverride ?? input).trim();
    const ready = attachments.filter((a) => a.status === "ready");
    if ((!text && ready.length === 0) || isLoading) return;

    setInput("");
    setLoading(true);
    setActiveQuestions(null);
    setAnswers({});
    debugLog("info", `Send: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);

    let docState = "";
    const t0 = performance.now();
    try {
      debugLog("info", "buildDocState: starting...");
      const state = await buildDocState();
      const selection = await buildUserSelection();
      docState = [state, selection].filter(Boolean).join("\n\n");
      const elapsed = Math.round(performance.now() - t0);
      debugLog("info", `buildDocState: done (${elapsed}ms, ${docState.length} chars)`);
    } catch (err) {
      debugLog("warn", `buildDocState: failed — ${(err as Error).message}`);
    }

    try {
      await sendMessage(text, docState || undefined, ready.length > 0 ? ready : undefined);
    } catch { /* errors surfaced via store */ } finally {
      debugLog("info", "handleSend: finally → setLoading(false)");
      setLoading(false);
    }
  }

  function sendAnswers() {
    if (!activeQuestions || activeQuestions.length === 0) return;
    const answered = Object.values(answers).filter(a => a).length;
    if (answered < activeQuestions.length) return;
    const lines = activeQuestions.map((aq, i) => `[${aq.header}] ${answers[i] || ""}`);
    handleSend({ textOverride: lines.join("; ") });
  }

  function toggleReasoning(id: string) {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!officeReady) {
    return (
      <div className="flex items-center justify-center h-full font-mono text-xs text-muted-foreground">
        <span className="text-primary mr-2">❯</span>initializing<span className="terminal-cursor" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full" {...handlers}>
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/70">
          <div className="animate-in fade-in zoom-in-95 border-2 border-dashed border-primary/60 bg-card px-6 py-4 font-mono text-xs text-primary duration-150">
            Drop files to attach
          </div>
        </div>
      )}

      <AttachmentQueue />

      <ScrollArea className="flex-1 min-h-0">
        {messages.length > 0 && (
          <div className="flex justify-end p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-[11px] gap-1.5"
            >
              {copied ? (
                <span className="text-primary">Copied!</span>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </Button>
          </div>
        )}

        <div className={`p-3 space-y-3 ${messages.length === 0 ? "h-full flex flex-col justify-center" : ""}`}>
          {messages.length === 0 && (() => {
            const copy = EMPTY_STATE_COPY[getHost()];
            return (
            <div className="text-center text-xs text-muted-foreground font-mono">
              <p className="mb-2 flex justify-center">
                <img src={logoUrl} alt="OpenDocBot" className="h-8 w-auto" />
              </p>
              <p className="mb-1 text-foreground text-center">{copy.title}</p>
              <p className="mt-1">{copy.hint}</p>
              <p className="mt-3 text-muted-foreground/60">_</p>
            </div>
            );
          })()}

          {messages.map((msg) => {
            const reasoning = "reasoning" in msg ? msg.reasoning : undefined;
            const isReasoningExpanded = expandedReasoning.has(msg.id);
            const hasContent = !!msg.content;
            const hasToolCalls = "toolCalls" in msg && msg.toolCalls && msg.toolCalls.length > 0;
            const hasAttachments = !!msg.attachments && msg.attachments.length > 0;

            return (
              <div
                className={`flex ${msg.role === "user" ? "justify-start" : "justify-start"}`}
                key={msg.id}
              >
                <div className="max-w-full w-full">
                  {reasoning && (
                    <div className="mb-1">
                      <button
                        onClick={() => toggleReasoning(msg.id)}
                        className={`font-mono text-[11px] px-1.5 py-0.5 border transition-colors ${
                          isReasoningExpanded
                            ? "bg-accent border-border text-accent-foreground"
                            : "bg-transparent border-transparent text-muted-foreground hover:bg-accent hover:border-border"
                        } ${!hasContent && !hasToolCalls ? "animate-pulse" : ""}`}
                      >
                        {!hasContent && !hasToolCalls
                          ? "▸ thinking"
                          : isReasoningExpanded
                            ? "▾ reasoning"
                            : "▸ reasoning"}
                      </button>
                      {isReasoningExpanded && (
                        <div className="mt-1 border border-border border-l-2 border-l-primary bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {reasoning}
                        </div>
                      )}
                    </div>
                  )}
                  {(hasContent || (!reasoning && msg.isThinking) || hasToolCalls || hasAttachments) && (
                    <div
                      className={`font-mono text-sm break-words ${
                        msg.role === "user"
                          ? "whitespace-pre-wrap border-l-2 border-l-primary pl-2.5 py-0.5 text-foreground"
                          : "text-foreground"
                      } ${!hasContent && msg.isThinking && !reasoning ? "animate-pulse" : ""}`}
                    >
                      {msg.role === "user" ? (
                        <>
                          {hasContent && (
                            <span className="text-primary select-none mr-1.5">❯</span>
                          )}
                          {msg.content}
                          {hasAttachments && (
                            <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                              {msg.attachments!.map((a) => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                                  title={a.name}
                                >
                                  <Paperclip className="w-3 h-3 shrink-0 text-primary/80" />
                                  <span className="max-w-[18rem] truncate">{a.name}</span>
                                  {a.meta?.pages ? (
                                    <span className="text-muted-foreground/60">· {a.meta.pages}p</span>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : hasContent ? (
                        <Markdown content={msg.content!} />
                      ) : msg.isThinking && !reasoning ? (
                        <span className="text-muted-foreground">
                          <span className="text-primary mr-1.5">_</span>thinking<span className="terminal-cursor" />
                        </span>
                      ) : (
                        ""
                      )}
                      {hasToolCalls && (
                        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                          {msg.toolCalls!.map((tc, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-primary select-none">$</span>
                              <span>{tc.function.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {pendingApproval && (
          <div className="px-3 pb-3">
            <ApprovalCard
              approval={pendingApproval}
              onApprove={() => resolveApproval(true)}
              onReject={() => resolveApproval(false)}
            />
          </div>
        )}

        {activeQuestions && activeQuestions.length > 0 && (
          <div className="px-3 pb-3 space-y-3">
            {activeQuestions.map((q, qi) => (
              <QuestionCard
                key={qi}
                question={q.question as string || ""}
                header={q.header as string || ""}
                options={(q.options as Array<{ label: string; description: string }>) || []}
                multiSelect={q.multiSelect as boolean || false}
                onSelect={(answer: string | null) => {
                  setAnswers(prev => ({ ...prev, [qi]: answer }));
                }}
                onSubmit={sendAnswers}
              />
            ))}
            {(() => {
              const total = activeQuestions.length;
              const answered = Object.values(answers).filter(a => a).length;
              const allAnswered = answered >= total;

              return (
                <button
                  onClick={sendAnswers}
                  disabled={!allAnswered}
                  className="w-full py-2 px-3 bg-primary text-primary-foreground font-mono text-sm font-semibold uppercase tracking-wider disabled:opacity-40"
                >
                  {allAnswered
                    ? "Send answers"
                    : `Answer all questions (${answered}/${total})`}
                </button>
              );
            })()}
          </div>
        )}
      </ScrollArea>

      <TodoPanel />

      {activeToolLabel && (
        <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs border-t bg-muted/50">
          <span
            className="inline-block w-2 h-2 bg-primary shrink-0"
            style={{
              animation: "toolPulse 0.8s ease-in-out infinite",
              boxShadow: "0 0 4px rgba(34, 197, 94, 0.5)",
            }}
          />
          <span className="text-primary select-none">$</span>
          <span className="text-muted-foreground">{activeToolLabel}</span>
        </div>
      )}
      <style>{`@keyframes toolPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>

      {error && (
        <div className="px-3 py-2 font-mono text-xs text-destructive bg-destructive/10 border-t border-destructive/30">
          <span className="mr-1.5 select-none">✕</span>
          {error}
        </div>
      )}

      <div className="border-t p-3 bg-muted/20">
        <div className="flex items-center gap-2 font-mono">
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={isLoading}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Add"
              title="Add"
              className="group relative grid h-8 w-7 place-items-center text-primary disabled:opacity-40"
            >
              <span
                className={`pointer-events-none absolute inset-0 grid place-items-center text-base leading-none transition-all duration-200 ${
                  menuOpen
                    ? "-rotate-90 scale-0 opacity-0"
                    : "rotate-0 scale-100 opacity-100 group-hover:-rotate-90 group-hover:scale-0 group-hover:opacity-0"
                }`}
              >
                ❯
              </span>
              <span
                className={`pointer-events-none absolute inset-0 grid place-items-center text-xl font-bold leading-none transition-all duration-200 ${
                  menuOpen
                    ? "rotate-0 scale-100 opacity-100"
                    : "-rotate-90 scale-0 opacity-0 group-hover:rotate-0 group-hover:scale-100 group-hover:opacity-100"
                }`}
              >
                +
              </span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-40 mb-2 w-44 border border-border bg-card font-mono text-xs shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Attach file
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) addFiles(files);
              e.target.value = "";
            }}
          />
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your request..."
            rows={1}
            className="min-h-0 resize-none text-sm bg-transparent border-none focus-visible:ring-0 focus-visible:border-none px-0"
          />
          {isLoading ? (
            <Button
              onClick={stopMessage}
              variant="outline"
              size="icon"
              className="shrink-0 h-8 w-8"
              aria-label="Stop"
              title="Stop"
              onMouseEnter={() => setStopHover(true)}
              onMouseLeave={() => setStopHover(false)}
            >
              {stopHover ? (
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
            </Button>
          ) : (
            <Button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !hasReadyAttachments) || isExtractingAttachments}
              variant="outline"
              size="icon"
              className="shrink-0 h-8 w-8 border-primary text-primary hover:bg-primary/10"
              aria-label="Send"
              title="Send"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 2l15 10-15 10V2z" />
              </svg>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
