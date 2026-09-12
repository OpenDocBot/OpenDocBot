import { useCallback } from "react";
import { toast } from "sonner";
import { useChatStore } from "../../store/chatStore";
import { useSettingsStore } from "../../store/settingsStore";
import { extractFile, ocrPdf } from "../../chat/attachments/extract";
import { attachmentFileCache } from "../../chat/attachments/fileCache";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  detectKind,
  formatBytes,
  unsupportedMessage,
} from "../../chat/attachments/config";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/** Validate, queue, and locally extract dropped or picked files. */
export function useAttachments() {
  const attachments = useChatStore((s) => s.attachments);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const updateAttachment = useChatStore((s) => s.updateAttachment);

  const removeAttachment = useCallback(
    (id: string) => {
      attachmentFileCache.delete(id);
      useChatStore.getState().removeAttachment(id);
    },
    []
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const current = useChatStore.getState().attachments;
      const room = MAX_FILES - current.length;
      if (room <= 0) {
        toast.error(`You can attach up to ${MAX_FILES} files.`);
        return;
      }
      if (files.length > room) {
        toast.error(`Only ${MAX_FILES} files can be attached at once.`);
      }

      for (const file of files.slice(0, room)) {
        const kind = detectKind(file.name);
        if (kind === "unsupported") {
          toast.error(unsupportedMessage(file.name));
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
          continue;
        }

        const id = crypto.randomUUID();
        attachmentFileCache.set(id, file);
        addAttachment({
          id,
          name: file.name,
          mime: file.type,
          size: file.size,
          kind,
          status: "extracting",
        });

        extractFile(file)
          .then((outcome) => {
            updateAttachment(id, {
              status: outcome.scanned ? "scanned" : "ready",
              text: outcome.text,
              truncated: outcome.truncated,
              meta: outcome.meta,
            });
            if (outcome.scanned) {
              toast.warning(
                `${file.name}: no text layer found. Choose "Run OCR" to read it locally. It is CPU-intensive and can take a while for large PDF files.`
              );
            }
          })
          .catch((err: unknown) => {
            updateAttachment(id, {
              status: "error",
              error: errorMessage(err, "Failed to read the file."),
            });
          });
      }
    },
    [addAttachment, updateAttachment]
  );

  const runOcr = useCallback(
    async (id: string) => {
      const file = attachmentFileCache.get(id);
      if (!file) {
        toast.error("The original file is no longer available.");
        return;
      }
      updateAttachment(id, { status: "ocr", progress: undefined, error: undefined });
      try {
        const language = useSettingsStore.getState().config.ocrLanguage;
        const outcome = await ocrPdf(file, {
          language,
          onProgress: (progress) => updateAttachment(id, { progress }),
        });
        updateAttachment(id, {
          status: "ready",
          text: outcome.text,
          truncated: outcome.truncated,
          meta: outcome.meta,
          confidence: outcome.confidence,
          progress: undefined,
          error: undefined,
        });
      } catch (err: unknown) {
        updateAttachment(id, {
          status: "error",
          progress: undefined,
          error: errorMessage(err, "OCR failed."),
        });
      }
    },
    [updateAttachment]
  );

  return { attachments, addFiles, removeAttachment, runOcr };
}
