import { describe, it, expect, beforeEach } from "vitest";
import { executeTool, toolRegistry } from "../../tools/registry";
import "../../tools/todo/updateTodos";
import { useTodoStore } from "../../store/todoStore";

beforeEach(() => {
  useTodoStore.getState().clearTodos();
});

describe("update_todos tool", () => {
  it("registers the tool", () => {
    expect(toolRegistry.getDefinition("update_todos")).toBeDefined();
  });

  it("creates tasks in bulk and returns the full list", async () => {
    const result = await executeTool("update_todos", {
      create: [{ title: "A" }, { title: "B" }, { title: "C", status: "in_progress" }],
    });
    const parsed = JSON.parse(result);
    expect(parsed.tasks.map((t: { id: string }) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(parsed.tasks[0].status).toBe("pending");
    expect(parsed.tasks[2].status).toBe("in_progress");
  });

  it("updates status, title, and description", async () => {
    await executeTool("update_todos", { create: [{ title: "A" }, { title: "B" }] });
    const result = await executeTool("update_todos", {
      update: [
        { id: "t1", status: "completed" },
        { id: "t2", title: "Renamed", description: "new desc" },
      ],
    });
    const parsed = JSON.parse(result);
    expect(parsed.tasks[0].status).toBe("completed");
    expect(parsed.tasks[1]).toMatchObject({ title: "Renamed", description: "new desc" });
  });

  it("errors on unknown task id", async () => {
    await executeTool("update_todos", { create: [{ title: "A" }] });
    const result = await executeTool("update_todos", {
      update: [{ id: "zzz", status: "completed" }],
    });
    expect(JSON.parse(result).error).toContain("Unknown task id");
  });

  it("removes tasks by id and returns the remaining list", async () => {
    await executeTool("update_todos", {
      create: [{ title: "A" }, { title: "B" }, { title: "C" }],
    });
    const result = await executeTool("update_todos", { remove: ["t2"] });
    const parsed = JSON.parse(result);
    expect(parsed.tasks.map((t: { id: string }) => t.id)).toEqual(["t1", "t3"]);
  });

  it("combines create, update, and remove in one atomic call", async () => {
    await executeTool("update_todos", { create: [{ title: "A" }, { title: "B" }] });
    const result = await executeTool("update_todos", {
      create: [{ title: "C" }],
      update: [{ id: "t1", status: "in_progress" }],
      remove: ["t2"],
    });
    const parsed = JSON.parse(result);
    expect(parsed.tasks.map((t: { id: string }) => t.id)).toEqual(["t1", "t3"]);
    expect(parsed.tasks[0].status).toBe("in_progress");
  });

  it("errors when no create/update/remove is provided", async () => {
    const result = await executeTool("update_todos", {});
    expect(JSON.parse(result).error).toContain("at least one of create, update, or remove");
  });

  it("keeps the store in sync with the UI", async () => {
    await executeTool("update_todos", { create: [{ title: "A" }] });
    await executeTool("update_todos", { update: [{ id: "t1", status: "in_progress" }] });
    const storeTodos = useTodoStore.getState().todos;
    expect(storeTodos).toHaveLength(1);
    expect(storeTodos[0].status).toBe("in_progress");
  });
});