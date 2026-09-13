import { useState } from "react";
import { useTodoStore } from "../../store/todoStore";
import type { Todo } from "../../store/todoStore";

function statusGlyph(todo: Todo): { glyph: string; className: string } {
  switch (todo.status) {
    case "in_progress":
      return { glyph: "▸", className: "text-primary" };
    case "completed":
      return { glyph: "[x]", className: "text-primary" };
    case "cancelled":
      return { glyph: "[–]", className: "text-muted-foreground" };
    default:
      return { glyph: "[ ]", className: "text-muted-foreground" };
  }
}

function TodoPanel() {
  const todos = useTodoStore((s) => s.todos);
  const [expanded, setExpanded] = useState(true);

  if (!todos.some((t) => t.status === "pending" || t.status === "in_progress")) return null;

  const done = todos.filter((t) => t.status === "completed").length;

  return (
    <div className="border-b border-border bg-card font-mono">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-muted/50 hover:bg-muted/70 transition-colors"
      >
        <span className="text-primary select-none">✓</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Tasks
        </span>
        <span className="text-[11px] text-muted-foreground">
          {done}/{todos.length}
        </span>
        <span className="ml-auto text-muted-foreground text-[11px]">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="max-h-40 overflow-y-auto px-3 py-2 space-y-1">
          {todos.map((todo) => {
            const { glyph, className } = statusGlyph(todo);
            return (
              <div key={todo.id} className="flex items-start gap-2 text-xs">
                <span className={`select-none shrink-0 ${className}`}>{glyph}</span>
                <span
                  className={
                    todo.status === "completed" || todo.status === "cancelled"
                      ? "text-muted-foreground line-through"
                      : todo.status === "in_progress"
                        ? "text-accent-foreground"
                        : "text-foreground"
                  }
                >
                  {todo.title}
                  {todo.description && (
                    <span className="text-muted-foreground"> — {todo.description}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TodoPanel;