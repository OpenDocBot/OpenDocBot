import { formatBytes } from "../../chat/attachments/config";
import type { Attachment } from "../../chat/types";
import { useAttachments } from "./useAttachments";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  File,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  ScanText,
  X,
} from "lucide-react";

function KindIcon({ kind }: { kind: Attachment["kind"] }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  if (kind === "sheet") return <FileSpreadsheet className={cls} />;
  if (kind === "slides") return <Presentation className={cls} />;
  if (kind === "text") return <FileText className={cls} />;
  return <File className={cls} />;
}

function statusLabel(a: Attachment): string {
  switch (a.status) {
    case "extracting":
      return "Reading…";
    case "ocr":
      return a.progress
        ? `Running OCR… ${a.progress.page}/${a.progress.totalPages}`
        : "Running OCR…";
    case "ready": {
      const detail = a.meta?.pages ? `${a.meta.pages} pages` : formatBytes(a.size);
      return a.truncated ? `${detail} · truncated` : detail;
    }
    case "scanned":
      return "Scanned PDF · no text layer";
    case "error":
      return a.error ?? "Failed to read";
  }
}

/** Pending attachments shown above the message list. */
export function AttachmentQueue() {
  const { attachments, removeAttachment, runOcr } = useAttachments();

  if (attachments.length === 0) return null;

  return (
    <div className="border-b border-border/60 bg-muted/20 px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Attachments · {attachments.length}
      </div>
      <div className="space-y-1">
        {attachments.map((a) => {
          const busy = a.status === "extracting" || a.status === "ocr";
          const tone =
            a.status === "error"
              ? "border-destructive/40 bg-destructive/5"
              : a.status === "scanned"
                ? "border-amber-800/60 bg-amber-950/30"
                : "border-border bg-card";
          return (
            <div
              key={a.id}
              className={`flex items-center gap-2 border px-2 py-1 font-mono text-[11px] ${tone}`}
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />
              ) : a.status === "scanned" || a.status === "error" ? (
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    a.status === "error" ? "text-destructive" : "text-amber-500"
                  }`}
                />
              ) : (
                <KindIcon kind={a.kind} />
              )}
              <span className="truncate text-foreground" title={a.name}>
                {a.name}
              </span>
              <span
                className={`truncate ${
                  a.status === "error" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {statusLabel(a)}
              </span>

              {a.status === "ready" && a.confidence != null && (
                <span
                  className={`shrink-0 ${
                    a.confidence < 70 ? "text-amber-500" : "text-muted-foreground/70"
                  }`}
                  title={
                    a.confidence < 70
                      ? "Low OCR confidence. Verify critical values (IDs, numbers) against the original."
                      : "Mean OCR confidence."
                  }
                >
                  OCR {Math.round(a.confidence)}%
                </span>
              )}

              {a.status === "scanned" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void runOcr(a.id)}
                  className="ml-auto h-6 shrink-0 gap-1 border-amber-700/60 px-2 text-[10px] text-amber-400 hover:bg-amber-950/40"
                  title="Run OCR locally. CPU-intensive and can be slow on multi-page scans."
                >
                  <ScanText className="w-3 h-3" />
                  Run OCR
                </Button>
              )}

              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`Remove ${a.name}`}
                title="Remove"
                className={`shrink-0 text-muted-foreground hover:text-foreground ${
                  a.status === "scanned" ? "" : "ml-auto"
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AttachmentQueue;
