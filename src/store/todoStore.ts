import { create } from "zustand";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Todo {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
}

export interface TodoInput {
  title: string;
  description?: string;
  status?: TodoStatus;
}

export interface TodoUpdate {
  id: string;
  title?: string;
  description?: string;
  status?: TodoStatus;
}

let nextId = 1;

function allocId(): string {
  return `t${nextId++}`;
}

function clone(todos: Todo[]): Todo[] {
  return todos.map((t) => ({ ...t }));
}

interface TodoStore {
  todos: Todo[];
  createTasks: (tasks: TodoInput[]) => Todo[];
  updateTasks: (updates: TodoUpdate[]) => Todo[] | { error: string };
  removeTasks: (ids: string[]) => Todo[];
  clearTodos: () => void;
}

export const useTodoStore = create<TodoStore>((set, get) => ({
  todos: [],

  createTasks: (tasks) => {
    const created = tasks.map((task) => ({
      id: allocId(),
      title: task.title,
      description: task.description,
      status: task.status ?? "pending",
    }));
    const todos = [...get().todos, ...created];
    set({ todos });
    return clone(todos);
  },

  updateTasks: (updates) => {
    const existing = get().todos;
    const byId = new Map(existing.map((t) => [t.id, t]));
    for (const u of updates) {
      if (!byId.has(u.id)) {
        return { error: `Unknown task id: ${u.id}` };
      }
    }
    const next = existing.map((t) => {
      const u = updates.find((x) => x.id === t.id);
      if (!u) return t;
      return {
        ...t,
        title: u.title ?? t.title,
        description: u.description !== undefined ? u.description : t.description,
        status: u.status ?? t.status,
      };
    });
    set({ todos: next });
    return clone(next);
  },

  removeTasks: (ids) => {
    const drop = new Set(ids);
    const todos = get().todos.filter((t) => !drop.has(t.id));
    set({ todos });
    return clone(todos);
  },

  clearTodos: () => {
    nextId = 1;
    set({ todos: [] });
  },
}));