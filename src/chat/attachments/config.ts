import type { AttachmentKind } from "../types";

/** Maximum number of files that can be queued at once. */
export const MAX_FILES = 5;

/** Per-file size cap (bytes). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Maximum extracted characters kept per file. */
export const MAX_TEXT_CHARS_PER_FILE = 150_000;

/** Maximum extracted characters kept across all attachments in one message. */
export const MAX_TEXT_CHARS_TOTAL = 300_000;

/**
 * A PDF whose extracted text is shorter than this (ignoring whitespace) is
 * treated as scanned / image-only and is offered for local OCR.
 */
export const SCANNED_PDF_MIN_CHARS = 200;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "json", "jsonl", "ndjson", "csv", "tsv",
  "xml", "html", "htm", "log", "yaml", "yml", "ini", "toml",
]);

const OFFICE_EXTENSIONS: Record<string, AttachmentKind> = {
  docx: "word",
  pptx: "slides",
  xlsx: "sheet",
  odt: "word",
  ods: "sheet",
  odp: "slides",
  rtf: "rtf",
};

/** Legacy binary Office formats are intentionally not supported. */
const LEGACY_EXTENSIONS = new Set(["doc", "ppt", "xls"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  mdx: "text/markdown",
  json: "application/json",
  jsonl: "application/x-ndjson",
  ndjson: "application/x-ndjson",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  log: "text/plain",
  yaml: "application/yaml",
  yml: "application/yaml",
  ini: "text/plain",
  toml: "application/toml",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
};

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

export function isLegacyOffice(filename: string): boolean {
  return LEGACY_EXTENSIONS.has(getExtension(filename));
}

/** Returns the attachment kind, or "unsupported" when the type is not handled. */
export function detectKind(filename: string): AttachmentKind | "unsupported" {
  const ext = getExtension(filename);
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (ext === "pdf") return "pdf";
  const office = OFFICE_EXTENSIONS[ext];
  if (office) return office;
  return "unsupported";
}

export function mimeForFilename(filename: string, fallback = ""): string {
  return MIME_BY_EXTENSION[getExtension(filename)] ?? fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function unsupportedMessage(filename: string): string {
  if (isLegacyOffice(filename)) {
    return `Legacy Office formats (.doc/.ppt/.xls) aren't supported. Save "${filename}" as .docx/.pptx/.xlsx and try again.`;
  }
  return `Unsupported file type: "${filename}".`;
}

/** Value for an `<input type="file" accept>` attribute. */
export const ATTACHMENT_ACCEPT = [
  ...TEXT_EXTENSIONS,
  "pdf",
  ...Object.keys(OFFICE_EXTENSIONS),
]
  .map((ext) => `.${ext}`)
  .join(",");
