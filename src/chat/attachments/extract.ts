import {
  MAX_TEXT_CHARS_PER_FILE,
  SCANNED_PDF_MIN_CHARS,
  detectKind,
  unsupportedMessage,
} from "./config";
import type { AttachmentMeta } from "../types";

export interface ExtractOutcome {
  text: string;
  truncated: boolean;
  /** Specifically for PDFs with no usable text layer (image-only scans). */
  scanned: boolean;
  meta?: AttachmentMeta;
  /** Mean Tesseract confidence (0-100) for OCR runs. */
  confidence?: number;
}

/**
 * Extract a file to Markdown/text in the browser. Text files are decoded
 * directly; PDFs go through our own patched `pdfjs-dist`; office formats go
 * through `officeparser`. Both heavy libraries are lazy-imported, so they are
 * only downloaded when a matching file is attached.
 *
 * Security note: officeparser bundles its own (vulnerable) pdfjs and must NOT
 * be used to parse PDFs — PDFs are always routed to `pdfjs-dist` above.
 */
export async function extractFile(file: File, signal?: AbortSignal): Promise<ExtractOutcome> {
  const kind = detectKind(file.name);
  if (kind === "unsupported") {
    throw new Error(unsupportedMessage(file.name));
  }
  if (kind === "text") {
    return finalize(await file.text(), { scanned: false });
  }
  if (kind === "pdf") {
    return extractPdf(file, signal);
  }
  return extractOffice(file);
}

function finalize(
  raw: string,
  extra: { scanned?: boolean; meta?: AttachmentMeta; confidence?: number }
): ExtractOutcome {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const truncated = text.length > MAX_TEXT_CHARS_PER_FILE;
  return {
    text: truncated ? text.slice(0, MAX_TEXT_CHARS_PER_FILE) : text,
    truncated,
    scanned: extra.scanned ?? false,
    meta: extra.meta,
    confidence: extra.confidence,
  };
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

function textFromItems(items: PdfTextItem[]): string {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    out += item.hasEOL ? "\n" : " ";
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ");
}

async function extractPdf(file: File, signal?: AbortSignal): Promise<ExtractOutcome> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  // `enableScripting` is not in the public type but is accepted by pdf.js and
  // is the documented mitigation for CVE-2026-16633. `isEvalSupported: false`
  // also disables eval-based font/CMap fast paths.
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableScripting: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  const onAbort = () => void loadingTask.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;
    const pages: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(textFromItems(content.items as PdfTextItem[]));
      page.cleanup();
    }
    await loadingTask.destroy();

    const text = pages.join("\n\n");
    const scanned = text.replace(/\s/g, "").length < SCANNED_PDF_MIN_CHARS;
    return finalize(text, { scanned, meta: { pages: numPages } });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

async function extractOffice(file: File): Promise<ExtractOutcome> {
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(file, {
    extractAttachments: false,
    ignoreInternalLinks: true,
    decompressionLimits: {
      maxUncompressedBytes: 256 * 1024 * 1024,
      maxZipEntries: 10_000,
      maxTableCells: 1_000_000,
    },
  });
  // `md` always yields a string; guard defensively for the union return type.
  const result = await ast.to("md", {
    generateIds: false,
    includeImages: false,
    includeCharts: false,
  });
  const value = result.value;
  const text = typeof value === "string" ? value : "";
  return finalize(text, { scanned: false });
}

export interface OcrProgress {
  page: number;
  totalPages: number;
}

/** Target render resolution for OCR (PDF points are 1/72 of an inch). */
const OCR_TARGET_DPI = 300;
/** Safety cap on per-page canvas area to bound memory use. */
const OCR_MAX_CANVAS_PIXELS = 40_000_000;

export interface OcrOptions {
  /** Tesseract language code (default "eng"). */
  language?: string;
  onProgress?: (progress: OcrProgress) => void;
  signal?: AbortSignal;
}

/**
 * OCR a scanned / image-only PDF locally by rendering each page to a canvas
 * and running Tesseract over it. CPU-intensive and slow: callers must obtain
 * explicit user approval before invoking this.
 */
export async function ocrPdf(
  file: File,
  { language, onProgress, signal }: OcrOptions = {}
): Promise<ExtractOutcome> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableScripting: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const { createWorker } = await import("tesseract.js");
  // Tesseract creates its worker from a blob: URL by default, which Office's
  // CSP (`script-src 'self' https: 'unsafe-inline' 'unsafe-eval'`, no
  // worker-src) blocks. Serve the worker from our own origin instead.
  const workerPath = (await import("tesseract.js/dist/worker.min.js?url")).default;
  const worker = await createWorker(language || "eng", undefined, {
    workerPath,
    workerBlobURL: false,
  });

  // Tesseract is tuned for ~300 DPI input. Since a canvas carries no DPI
  // metadata, it otherwise guesses; `user_defined_dpi` tells it the truth.
  let appliedDpi = OCR_TARGET_DPI;
  await worker.setParameters({
    user_defined_dpi: String(OCR_TARGET_DPI),
    preserve_interword_spaces: "1",
  });

  try {
    const pages: string[] = [];
    const confidences: number[] = [];
    for (let i = 1; i <= numPages; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const area = base.width * base.height;
      let scale = OCR_TARGET_DPI / 72;
      if (area > 0 && area * scale * scale > OCR_MAX_CANVAS_PIXELS) {
        // Clamp for oversized pages so the canvas can't exhaust memory.
        scale = Math.sqrt(OCR_MAX_CANVAS_PIXELS / area);
      }
      const actualDpi = Math.max(1, Math.round(scale * 72));
      if (actualDpi !== appliedDpi) {
        appliedDpi = actualDpi;
        await worker.setParameters({ user_defined_dpi: String(actualDpi) });
      }
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { data: result } = await worker.recognize(canvas);
      pages.push(result.text);
      if (typeof result.confidence === "number" && Number.isFinite(result.confidence)) {
        confidences.push(result.confidence);
      }
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.({ page: i, totalPages: numPages });
    }
    const text = pages.join("\n\n");
    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : undefined;
    return finalize(text, { scanned: false, meta: { pages: numPages }, confidence });
  } finally {
    await worker.terminate().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }
}
