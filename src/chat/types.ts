import type { ToolCallRequest } from "../providers/types";

export type AttachmentKind = "text" | "pdf" | "word" | "sheet" | "slides" | "rtf";

export type AttachmentStatus = "extracting" | "ready" | "scanned" | "ocr" | "error";

export interface AttachmentMeta {
  pages?: number;
  slides?: number;
  sheets?: number;
}

/**
 * A file the user attached to a message. Files are parsed in the browser:
 * text is decoded directly, office/PDF formats are converted to Markdown by
 * local extractors (see `src/chat/attachments`). `text` holds the extracted
 * content that is injected into the model prompt.
 */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  status: AttachmentStatus;
  /** Extracted Markdown/text; present once `status` is "ready" or "scanned". */
  text?: string;
  /** True when the extracted text exceeded the per-file cap and was cut. */
  truncated?: boolean;
  meta?: AttachmentMeta;
  /** Local OCR progress while `status` is "ocr". */
  progress?: { page: number; totalPages: number };
  /** Mean Tesseract confidence (0-100) for OCR runs. */
  confidence?: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallRequest[];
  toolName?: string;
  attachments?: Attachment[];
  isStreaming?: boolean;
  isThinking?: boolean;
  timestamp: number;
}

export interface AgentState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  currentToolName: string | null;
  streamingContent: string;
}

export function createUserMessage(text: string, attachments?: Attachment[]): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: text,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    timestamp: Date.now(),
  };
}

export function createAssistantPlaceholder(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    isThinking: true,
    isStreaming: true,
    timestamp: Date.now(),
  };
}
