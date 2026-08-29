import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { useTodoStore } from "../../store/todoStore";
import type { TodoInput, TodoUpdate } from "../../store/todoStore";

const updateTodos: ToolDefinition = {
  name: "update_todos",
  host: "both",
  description:
    "Update the task list in ONE atomic call: create new tasks, change the status/title/description of " +
    "existing ones (using their id), and/or remove tasks. Use this to structure complex, multi-step work. " +
    "Returns the full task list with ids.",
  parameters: {
    type: "object",
    properties: {
      create: {
        type: "array",
        description: "Tasks to create.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, specific task title (e.g. 'Summarize the intro')." },
            description: { type: "string", description: "Optional details or acceptance criteria for the task." },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Optional initial status (default: pending). Keep at most one task in_progress.",
            },
          },
          required: ["title"],
        },
      },
      update: {
        type: "array",
        description: "Changes to existing tasks, referenced by id.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Task id from the current task list (e.g. 't1')." },
            title: { type: "string", description: "New title." },
            description: { type: "string", description: "New description (omit to keep)." },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "New status. Keep at most one task in_progress; mark completed only after verifying.",
            },
          },
          required: ["id"],
        },
      },
      remove: {
        type: "array",
        description: "Ids of tasks to remove (no longer relevant).",
        items: { type: "string" },
      },
      action_description: { type: "string", description: "Optional user-facing label for the tool bar." },
    },
  },
};

toolRegistry.register(updateTodos, (args) => {
  const create = (args.create as TodoInput[] | undefined) ?? [];
  const update = (args.update as TodoUpdate[] | undefined) ?? [];
  const remove = (args.remove as string[] | undefined) ?? [];

  if (create.length === 0 && update.length === 0 && remove.length === 0) {
    return JSON.stringify({ error: "Provide at least one of create, update, or remove" });
  }

  const store = useTodoStore.getState();
  if (create.length > 0) store.createTasks(create);
  if (update.length > 0) {
    const result = store.updateTasks(update);
    if ("error" in result) {
      return JSON.stringify({ error: result.error });
    }
  }
  if (remove.length > 0) store.removeTasks(remove);

  return JSON.stringify({ tasks: useTodoStore.getState().todos });
});