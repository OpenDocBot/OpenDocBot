import { describe, it, expect, beforeEach } from "vitest";
import { useTodoStore } from "../../store/todoStore";
import type { Todo } from "../../store/todoStore";

function asList(result: Todo[] | { error: string }): Todo[] {
  if ("error" in result) throw new Error(result.error);
  return result;
}

beforeEach(() => {
  useTodoStore.getState().clearTodos();
});

describe("todoStore", () => {
  it("creates tasks with sequential ids and pending default", () => {
    const list = useTodoStore.getState().createTasks([
      { title: "First" },
      { title: "Second", description: "details" },
      { title: "Third", status: "in_progress" },
    ]);
    expect(list.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(list[0].status).toBe("pending");
    expect(list[1].description).toBe("details");
    expect(list[2].status).toBe("in_progress");
    expect(useTodoStore.getState().todos).toHaveLength(3);
  });

  it("appends ids across calls without collisions", () => {
    useTodoStore.getState().createTasks([{ title: "A" }]);
    useTodoStore.getState().createTasks([{ title: "B" }, { title: "C" }]);
    expect(useTodoStore.getState().todos.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("updates status, title, and description", () => {
    useTodoStore.getState().createTasks([{ title: "A" }, { title: "B" }]);
    const list = asList(useTodoStore.getState().updateTasks([
      { id: "t1", status: "in_progress" },
      { id: "t2", title: "Renamed", description: "new desc" },
    ]));
    expect(list[0].status).toBe("in_progress");
    expect(list[1].title).toBe("Renamed");
    expect(list[1].description).toBe("new desc");
  });

  it("keeps unspecified fields on partial update", () => {
    useTodoStore.getState().createTasks([{ title: "A", description: "d" }]);
    const list = asList(useTodoStore.getState().updateTasks([{ id: "t1", status: "completed" }]));
    expect(list[0]).toMatchObject({ title: "A", description: "d", status: "completed" });
  });

  it("returns error for unknown task id", () => {
    useTodoStore.getState().createTasks([{ title: "A" }]);
    const result = useTodoStore.getState().updateTasks([{ id: "nope", status: "completed" }]);
    expect("error" in result).toBe(true);
  });

  it("removes tasks by id", () => {
    useTodoStore.getState().createTasks([{ title: "A" }, { title: "B" }, { title: "C" }]);
    const list = useTodoStore.getState().removeTasks(["t2"]);
    expect(list.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("clears todos and resets id counter", () => {
    useTodoStore.getState().createTasks([{ title: "A" }]);
    useTodoStore.getState().clearTodos();
    expect(useTodoStore.getState().todos).toHaveLength(0);
    const list = useTodoStore.getState().createTasks([{ title: "B" }]);
    expect(list[0].id).toBe("t1");
  });
});