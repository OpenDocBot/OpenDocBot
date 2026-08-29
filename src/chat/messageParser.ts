import type { ChatResponse, LLMMessage, ToolCallRequest } from "../providers/types";

export interface ParsedResponse {
  type: "text" | "tool_calls" | "mixed";
  content: string;
  toolCalls: ToolCallRequest[];
}

export function parseResponse(response: ChatResponse): ParsedResponse {
  const hasContent =
    response.content !== null &&
    response.content !== undefined &&
    response.content.trim().length > 0;

  const hasToolCalls = response.toolCalls.length > 0;

  if (hasContent && hasToolCalls) {
    return { type: "mixed", content: response.content!, toolCalls: response.toolCalls };
  }
  if (hasToolCalls) {
    return { type: "tool_calls", content: "", toolCalls: response.toolCalls };
  }
  return { type: "text", content: response.content ?? "", toolCalls: [] };
}

export function buildToolResultMessage(
  toolCall: ToolCallRequest,
  result: string
): LLMMessage {
  return {
    role: "tool",
    content: result,
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
  };
}
