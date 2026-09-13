import type { ToolDefinition } from "../providers/types";

export interface ToolRegistry {
  register(tool: ToolDefinition, executor: ToolExecutor): void;
  getDefinition(name: string): ToolDefinition | undefined;
  getExecutor(name: string): ToolExecutor | undefined;
  listDefinitions(): ToolDefinition[];
  listDefinitionsForHost(host: string): ToolDefinition[];
  listNames(): string[];
  listNamesForHost(host: string): string[];
}

export type ToolExecutor = (args: Record<string, unknown>) => string | Promise<string>;

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  tool_call_id: string;
  name: string;
  output: string;
}
