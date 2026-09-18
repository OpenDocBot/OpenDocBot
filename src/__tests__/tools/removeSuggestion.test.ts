import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool } from "../../tools/registry";
import {
  registerSuggestion,
  getSuggestion,
  clearSuggestions,
} from "../../chat/suggestionRegistry";

// Import registers the tools
import "../../tools/suggestion/addSuggestion";
import "../../tools/suggestion/removeSuggestion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

type Host = "Word" | "Excel" | "PowerPoint";

function setOffice(host: Host, supported = true): void {
  g.Office = {
    onReady: () => {},
    context: {
      host,
      requirements: { isSetSupported: () => supported },
    },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
  };
}

beforeEach(() => {
  g.Office = undefined;
  g.Word = undefined;
  g.Excel = undefined;
  clearSuggestions();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remove_suggestion — guards", () => {
  it("errors when id is missing", async () => {
    setOffice("Word");
    const result = JSON.parse(await executeTool("remove_suggestion", {}));
    expect(result.error).toMatch(/id is required/);
  });

  it("refuses ids that were not registered (not ours)", async () => {
    setOffice("Word");
    const result = JSON.parse(await executeTool("remove_suggestion", { id: "someone-else" }));
    expect(result.error).toMatch(/Only suggestions the assistant added/);
  });

  it("errors in PowerPoint", async () => {
    registerSuggestion("c1", { host: "word", text: "t", createdAt: 1 });
    setOffice("PowerPoint");
    const result = JSON.parse(await executeTool("remove_suggestion", { id: "c1" }));
    expect(result.error).toMatch(/only available in Word and Excel/);
  });

  it("returns a dev note outside Office and clears the id", async () => {
    registerSuggestion("c1", { host: "word", text: "t", createdAt: 1 });
    const result = JSON.parse(await executeTool("remove_suggestion", { id: "c1" }));
    expect(result.dev_note).toBeDefined();
    expect(getSuggestion("c1")).toBeUndefined();
  });
});

describe("remove_suggestion — Word", () => {
  it("deletes a registered suggestion by id", async () => {
    const del = vi.fn();
    const comments = { load: vi.fn(), items: [{ id: "c1", delete: del }] };
    g.Word = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ document: { body: { getComments: () => comments } }, sync: async () => {} }),
    };
    setOffice("Word");
    registerSuggestion("c1", { host: "word", anchor: "Madrid", text: "Fix this", createdAt: 1 });

    const result = JSON.parse(await executeTool("remove_suggestion", { id: "c1" }));
    expect(result.ok).toBe(true);
    expect(del).toHaveBeenCalled();
    expect(getSuggestion("c1")).toBeUndefined();
  });

  it("reports an error when the comment no longer exists", async () => {
    const comments = { load: vi.fn(), items: [] };
    g.Word = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ document: { body: { getComments: () => comments } }, sync: async () => {} }),
    };
    setOffice("Word");
    registerSuggestion("c1", { host: "word", text: "t", createdAt: 1 });

    const result = JSON.parse(await executeTool("remove_suggestion", { id: "c1" }));
    expect(result.error).toMatch(/no longer exists/);
    expect(getSuggestion("c1")).toBeUndefined();
  });

  it("errors when comments are unsupported (older Word)", async () => {
    setOffice("Word", false);
    registerSuggestion("c1", { host: "word", text: "t", createdAt: 1 });
    g.Word = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("remove_suggestion", { id: "c1" }));
    expect(result.error).toMatch(/WordApi 1\.4/);
  });
});

describe("remove_suggestion — Excel", () => {
  it("deletes a registered suggestion on its sheet", async () => {
    const del = vi.fn();
    const comment = { delete: del };
    const sheet = {
      load: vi.fn(),
      isNullObject: false,
      comments: { getItem: vi.fn(() => comment) },
    };
    g.Excel = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ workbook: { worksheets: { getItemOrNullObject: () => sheet } }, sync: async () => {} }),
    };
    setOffice("Excel");
    registerSuggestion("x1", {
      host: "excel",
      sheet: "Sheet1",
      cell: "B4",
      text: "Check",
      createdAt: 1,
    });

    const result = JSON.parse(await executeTool("remove_suggestion", { id: "x1" }));
    expect(result.ok).toBe(true);
    expect(del).toHaveBeenCalled();
    expect(getSuggestion("x1")).toBeUndefined();
  });

  it("errors when the worksheet is gone", async () => {
    const sheet = { load: vi.fn(), isNullObject: true, comments: { getItem: vi.fn() } };
    g.Excel = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ workbook: { worksheets: { getItemOrNullObject: () => sheet } }, sync: async () => {} }),
    };
    setOffice("Excel");
    registerSuggestion("x1", { host: "excel", sheet: "Gone", text: "t", createdAt: 1 });

    const result = JSON.parse(await executeTool("remove_suggestion", { id: "x1" }));
    expect(result.error).toMatch(/Worksheet "Gone" not found/);
  });

  it("errors when comments are unsupported (older Excel)", async () => {
    setOffice("Excel", false);
    registerSuggestion("x1", { host: "excel", sheet: "Sheet1", text: "t", createdAt: 1 });
    g.Excel = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("remove_suggestion", { id: "x1" }));
    expect(result.error).toMatch(/ExcelApi 1\.10/);
  });
});
