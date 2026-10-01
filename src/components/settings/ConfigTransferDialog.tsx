import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, X } from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { exportConfigBlob, importConfigBlob } from "../../lib/configExport";
import { ConfigCryptoError } from "../../lib/configCrypto";
import { generatePassphrase, isUsablePassphrase } from "../../lib/passphrase";
import { downloadTextFile } from "../../lib/download";
import { copyText } from "../../lib/clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FILE_NAME = "opendocbot-config.txt";

type Step = "choose" | "export" | "import";

function describeError(error: unknown): string {
  if (error instanceof ConfigCryptoError) {
    if (error.code === "EMPTY_PASSPHRASE") return "Enter a passphrase.";
    if (error.code === "WRONG_PASSPHRASE") return "Wrong passphrase.";
  }
  return "Invalid file.";
}

/**
 * Yield until the browser has actually painted. The crypto work is synchronous,
 * so without a real paint opportunity React would commit the "busy" label but
 * never get to show it before the main thread blocks. Resolving inside a plain
 * requestAnimationFrame is not enough (the continuation runs before the paint),
 * hence the rAF + macrotask hop.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => window.setTimeout(resolve, 0));
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}

interface ConfigTransferDialogProps {
  onClose: () => void;
}

/**
 * Guided export/import flow. Mounted only while open (the parent conditionally
 * renders it), so each open starts from a clean state.
 */
export function ConfigTransferDialog({ onClose }: ConfigTransferDialogProps) {
  const config = useSettingsStore((s) => s.config);
  const replaceConfig = useSettingsStore((s) => s.replaceConfig);

  const [step, setStep] = useState<Step>("choose");
  const [passphrase, setPassphrase] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [fileBlob, setFileBlob] = useState("");
  const [fileName, setFileName] = useState("");
  const [imported, setImported] = useState(false);
  const [importPassphrase, setImportPassphrase] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  // Keep the latest onClose without re-running the mount effect below. Re-running
  // it on every parent render would clear a pending auto-close timer.
  const onCloseRef = useRef(onClose);

  const exportReady = isUsablePassphrase(passphrase);
  const importReady = fileBlob.trim().length > 0 && isUsablePassphrase(importPassphrase);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function scheduleClose() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), 2000);
  }

  async function handleCopyPassphrase() {
    const ok = await copyText(passphrase);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Could not copy.");
    }
  }

  async function handleDownload() {
    setError("");
    setBusy("export");
    await nextPaint();
    try {
      const blob = await exportConfigBlob(config, passphrase);
      downloadTextFile(FILE_NAME, blob);
      setDownloaded(true);
      scheduleClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setError("");
    setBusy("import");
    await nextPaint();
    try {
      const { config: importedConfig } = await importConfigBlob(fileBlob, importPassphrase);
      replaceConfig(importedConfig);
      setImported(true);
      scheduleClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  function submitExport() {
    if (!exportReady || downloaded || busy !== null) return;
    void handleDownload();
  }

  function submitImport() {
    if (!importReady || busy !== null) return;
    void handleImport();
  }

  async function loadFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    try {
      const text = await file.text();
      setFileBlob(text);
      setFileName(file.name);
    } catch {
      setError("Invalid file.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Export or import settings"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm border bg-background p-3 space-y-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          {step === "choose" || imported ? (
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Settings
            </span>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setStep("choose");
                setError("");
              }}
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {step === "choose" && (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={() => setStep("export")}>
              Export
            </Button>
            <Button variant="secondary" onClick={() => setStep("import")}>
              Import
            </Button>
          </div>
        )}

        {step === "export" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="transferPassphrase">Passphrase</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="transferPassphrase"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitExport();
                  }}
                  placeholder="Type or generate"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleCopyPassphrase}
                  disabled={!exportReady}
                  title="Copy passphrase"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPassphrase(generatePassphrase())}>
                Generate
              </Button>
            </div>

            <Button
              className="w-full"
              onClick={submitExport}
              disabled={!exportReady || downloaded || busy !== null}
            >
              {busy === "export" ? "Downloading..." : downloaded ? "Downloaded" : "Download"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Share the file and passphrase separately.
            </p>
          </div>
        )}

        {step === "import" &&
          (imported ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="relative flex h-14 w-14 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
                <span className="relative inline-flex h-12 w-12 animate-in zoom-in-50 fade-in items-center justify-center rounded-full bg-primary text-primary-foreground duration-300">
                  <Check className="h-6 w-6" strokeWidth={3} />
                </span>
              </span>
              <span className="animate-in fade-in text-center text-xs text-muted-foreground duration-500">
                Settings imported successfully.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void loadFile(event.dataTransfer.files?.[0]);
                }}
                className={`flex items-center justify-center gap-1.5 border border-dashed px-3 py-6 text-center text-xs cursor-pointer ${
                  fileName || dragging ? "border-primary text-foreground" : "text-muted-foreground"
                }`}
              >
                {fileName ? (
                  <>
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="max-w-full truncate">{fileName}</span>
                  </>
                ) : (
                  "Drop file here or browse"
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />

              <div className="space-y-1.5">
                <Label htmlFor="transferImportPassphrase">Passphrase</Label>
                <Input
                  id="transferImportPassphrase"
                  type="password"
                  autoComplete="new-password"
                  value={importPassphrase}
                  onChange={(event) => setImportPassphrase(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitImport();
                  }}
                  placeholder="Passphrase"
                />
              </div>

              <Button className="w-full" onClick={submitImport} disabled={!importReady || busy !== null}>
                {busy === "import" ? "Importing..." : "Import"}
              </Button>
            </div>
          ))}

        {error.length > 0 && !imported && (
          <p role="alert" className="text-xs text-amber-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
