import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool } from "../../tools/registry";
import { clearSuggestions, getSuggestion } from "../../chat/suggestionRegistry";

// Import registers the tool
import "../../tools/suggestion/addSuggestion";

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

describe("add_suggestion — dev mode", () => {
  it("returns a dev note when Office is absent", async () => {
    const result = JSON.parse(await executeTool("add_suggestion", { text: "x" }));
    expect(result.dev_note).toBeDefined();
  });
});

describe("add_suggestion — Word", () => {
  it("inserts a comment on a unique match", async () => {
    const load = vi.fn();
    const insertComment = vi.fn(() => ({ load, id: "c1" }));
    const search = { load: vi.fn(), items: [{ insertComment }] };
    g.Word = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ document: { body: { search: () => search } }, sync: async () => {} }),
    };
    setOffice("Word");

    const result = JSON.parse(
      await executeTool("add_suggestion", { text: "Fix this", target_text: "Hello" })
    );
    expect(result.ok).toBe(true);
    expect(result.id).toBe("c1");
    expect(insertComment).toHaveBeenCalledWith("Fix this");
    expect(load).toHaveBeenCalledWith("id");
    expect(getSuggestion("c1")?.host).toBe("word");
  });

  it("errors when target_text is missing", async () => {
    setOffice("Word");
    g.Word = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("add_suggestion", { text: "Fix" }));
    expect(result.error).toMatch(/target_text is required/);
  });

  it("errors when there is no match", async () => {
    const search = { load: vi.fn(), items: [] };
    g.Word = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ document: { body: { search: () => search } }, sync: async () => {} }),
    };
    setOffice("Word");
    const result = JSON.parse(
      await executeTool("add_suggestion", { text: "Fix", target_text: "Nope" })
    );
    expect(result.error).toMatch(/not found/);
  });

  it("errors when the match is ambiguous", async () => {
    const search = {
      load: vi.fn(),
      items: [{ insertComment: vi.fn() }, { insertComment: vi.fn() }],
    };
    g.Word = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({ document: { body: { search: () => search } }, sync: async () => {} }),
    };
    setOffice("Word");
    const result = JSON.parse(
      await executeTool("add_suggestion", { text: "Fix", target_text: "Dup" })
    );
    expect(result.error).toMatch(/unique/);
  });

  it("errors when comments are unsupported (older Word)", async () => {
    setOffice("Word", false);
    g.Word = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(
      await executeTool("add_suggestion", { text: "Fix", target_text: "Hi" })
    );
    expect(result.error).toMatch(/WordApi 1\.4/);
  });
});

describe("add_suggestion — Excel", () => {
  it("adds a comment to a single cell", async () => {
    const load = vi.fn();
    const add = vi.fn(() => ({ load, id: "x1" }));
    const sheet = {
      name: "Sheet1",
      load: vi.fn(),
      getRange: vi.fn(() => ({})),
      comments: { add },
    };
    g.Excel = {
      run: async (cb: (ctx: unknown) => unknown) =>
        cb({
          workbook: { worksheets: { getActiveWorksheet: () => sheet } },
          sync: async () => {},
        }),
    };
    setOffice("Excel");

    const result = JSON.parse(await executeTool("add_suggestion", { text: "Check", cell: "B4" }));
    expect(result.ok).toBe(true);
    expect(result.id).toBe("x1");
    expect(add).toHaveBeenCalledWith({}, "Check");
    expect(getSuggestion("x1")?.sheet).toBe("Sheet1");
  });

  it("errors when cell is missing", async () => {
    setOffice("Excel");
    g.Excel = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("add_suggestion", { text: "Check" }));
    expect(result.error).toMatch(/cell is required/);
  });

  it("errors when cell is not a single cell", async () => {
    setOffice("Excel");
    g.Excel = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("add_suggestion", { text: "Check", cell: "A1:B2" }));
    expect(result.error).toMatch(/single-cell/);
  });

  it("errors when comments are unsupported (older Excel)", async () => {
    setOffice("Excel", false);
    g.Excel = {
      run: async () => {
        throw new Error("should not run");
      },
    };
    const result = JSON.parse(await executeTool("add_suggestion", { text: "Check", cell: "B4" }));
    expect(result.error).toMatch(/ExcelApi 1\.10/);
  });
});

describe("add_suggestion — PowerPoint", () => {
  it("errors in PowerPoint", async () => {
    setOffice("PowerPoint");
    const result = JSON.parse(await executeTool("add_suggestion", { text: "x", cell: "B4" }));
    expect(result.error).toMatch(/only available in Word and Excel/);
  });
});
