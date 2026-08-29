import type { ToolRegistry, ToolExecutor } from "./types";
import type { ToolDefinition } from "../providers/types";

class Registry implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private executors = new Map<string, ToolExecutor>();

  register(tool: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(tool.name, tool);
    this.executors.set(tool.name, executor);
  }

  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getExecutor(name: string): ToolExecutor | undefined {
    return this.executors.get(name);
  }

  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listDefinitionsForHost(host: string): ToolDefinition[] {
    return this.listDefinitions().filter((t) => toolAppliesToHost(t, host));
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  listNamesForHost(host: string): string[] {
    return this.listDefinitionsForHost(host).map((t) => t.name);
  }
}

/** A tool applies to a host unless explicitly scoped to a different host. */
export function toolAppliesToHost(tool: ToolDefinition, host: string): boolean {
  if (!tool.host || tool.host === "both") return true;
  return tool.host === host;
}

export const toolRegistry = new Registry();

export function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const executor = toolRegistry.getExecutor(name);
  if (!executor) {
    return Promise.resolve(
      JSON.stringify({ error: `Unknown tool: ${name}` })
    );
  }
  try {
    return Promise.resolve(executor(args)).catch((err: Error) =>
      JSON.stringify({ error: `Tool error: ${err.message}` })
    );
  } catch (err) {
    return Promise.resolve(
      JSON.stringify({ error: `Tool error: ${(err as Error).message}` })
    );
  }
}
