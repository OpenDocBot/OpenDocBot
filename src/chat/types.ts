import type { ToolCallRequest } from "../providers/types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCallRequest[];
  toolName?: string;
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

export function createUserMessage(text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: text,
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
