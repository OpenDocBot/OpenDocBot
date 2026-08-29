import { create } from "zustand";
import type { ChatMessage } from "../chat/types";
import { createUserMessage, createAssistantPlaceholder } from "../chat/types";
import type { LLMMessage } from "../providers/types";

type StoreMessage = ChatMessage;

export interface PendingApproval {
  toolName: string;
  label?: string;
  args: Record<string, unknown>;
}

interface ChatStore {
  messages: StoreMessage[];
  modelHistory: LLMMessage[];
  isLoading: boolean;
  error: string | null;
  currentToolName: string | null;
  activeToolLabel: string | null;
  activeQuestions: Record<string, unknown>[] | null;
  pendingApproval: PendingApproval | null;
  addUserMessage: (text: string) => ChatMessage;
  addAssistantPlaceholder: () => ChatMessage;
  appendToken: (messageId: string, token: string) => void;
  appendReasoning: (messageId: string, token: string) => void;
  finalizeMessage: (messageId: string, content: string, toolCalls?: ChatMessage["toolCalls"]) => void;
  setThinking: (messageId: string, thinking: boolean) => void;
  setCurrentTool: (toolName: string | null) => void;
  addToolStatusMessage: (name: string, label?: string) => void;
  markLastToolDone: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveQuestions: (questions: Record<string, unknown>[] | null) => void;
  setPendingApproval: (approval: PendingApproval | null) => void;
  setModelHistory: (messages: LLMMessage[]) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  modelHistory: [],
  isLoading: false,
  error: null,
  currentToolName: null,
  activeToolLabel: null,
  activeQuestions: null,
  pendingApproval: null,

  addUserMessage: (text) => {
    const msg = createUserMessage(text);
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  addAssistantPlaceholder: () => {
    const msg = createAssistantPlaceholder();
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  appendToken: (messageId, token) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === "assistant" && m.id === messageId
          ? { ...m, content: m.content + token }
          : m
      ),
    }));
  },

  appendReasoning: (messageId, token) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === "assistant" && m.id === messageId
          ? { ...m, reasoning: (m.reasoning || "") + token, isThinking: true }
          : m
      ),
    }));
  },

  finalizeMessage: (messageId, content, toolCalls) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === "assistant" && m.id === messageId
          ? { ...m, content, toolCalls, isStreaming: false, isThinking: false }
          : m
      ),
    }));
  },

  setThinking: (messageId, thinking) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.role === "assistant" && m.id === messageId
          ? { ...m, isThinking: thinking }
          : m
      ),
    }));
  },

  setCurrentTool: (toolName) => set({ currentToolName: toolName }),

  addToolStatusMessage: (_name, label) => {
    set({ activeToolLabel: label || _name });
  },

  markLastToolDone: () => {
    // Tool indicator stays visible until isLoading becomes false
  },

  setLoading: (loading) => {
    set({ isLoading: loading, activeToolLabel: loading ? null : null });
  },

  setError: (error) => set({ error }),

  setActiveQuestions: (questions) => set({ activeQuestions: questions }),

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  setModelHistory: (messages) => set({ modelHistory: messages }),

  clearMessages: () =>
    set({
      messages: [],
      modelHistory: [],
      isLoading: false,
      error: null,
      currentToolName: null,
      activeToolLabel: null,
      activeQuestions: null,
      pendingApproval: null,
    }),
}));
