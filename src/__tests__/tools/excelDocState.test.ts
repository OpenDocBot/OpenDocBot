import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildDocState, buildUserSelection } from "../../tools/docState";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

function mockExcelHost() {
  g.Office = { onReady: () => {}, context: { host: "Excel" }, HostType: { Word: "Word", Excel: "Excel" } };
}

beforeEach(() => {
  g.Excel = undefined;
  g.Office = undefined;
});

function installMockExcelWorkbook() {
  const sync = vi.fn().mockResolvedValue(undefined);

  const sheet1Used = {
    rowCount: 2,
    columnCount: 2,
    address: "A1:B2",
    values: [
      ["Header A", "Header B"],
      [1, 2],
    ],
    load: vi.fn(),
  };
  const sheet2Used = {
    rowCount: 0,
    columnCount: 0,
    address: "A1:A1",
    values: [[]],
    load: vi.fn(),
  };

  const sheet1 = {
    name: "Data",
    getUsedRange: () => sheet1Used,
    load: vi.fn(),
  };
  const sheet2 = {
    name: "Empty",
    getUsedRange: () => sheet2Used,
    load: vi.fn(),
  };

  const selectedRange = {
    address: "C3:D4",
    values: [
      ["x", "y"],
      ["z", ""],
    ],
    load: vi.fn(),
  };

  const context = {
    workbook: {
      name: "Book1.xlsx",
      worksheets: {
        items: [sheet1, sheet2],
        getActiveWorksheet: () => sheet1,
        load: vi.fn(),
      },
      getSelectedRange: () => selectedRange,
      load: vi.fn(),
    },
    sync,
  };

  mockExcelHost();
  g.Excel = { run: (fn: (ctx: unknown) => unknown) => fn(context) };

  return { context, sheet1, sheet2, selectedRange, sheet1Used, sheet2Used };
}

describe("buildExcelDocState (dev mode)", () => {
  it("returns dev-mode snapshot when Excel is unavailable", async () => {
    mockExcelHost();
    const state = await buildDocState();
    expect(state).toContain("<doc_state>");
    expect(state).toContain("No workbook loaded");
  });

  it("falls back to word doc_state for the word host", async () => {
    g.Office = undefined;
    g.Excel = undefined;
    const state = await buildDocState();
    expect(state).toContain("No document loaded");
  });
});

describe("buildExcelUserSelection (dev mode)", () => {
  it("returns empty string when Excel is unavailable", async () => {
    mockExcelHost();
    const selection = await buildUserSelection();
    expect(selection).toBe("");
  });
});

describe("buildExcelDocState (mocked Excel)", () => {
  it("renders workbook name, sheets, and previews", async () => {
    installMockExcelWorkbook();
    const state = await buildDocState();
    expect(state).toContain("<doc_state>");
    expect(state).toContain("Workbook: Book1.xlsx");
    expect(state).toContain("Worksheets: 2");
    expect(state).toContain("Active sheet: Data");
    expect(state).toContain('Sheet "Data" (2 rows × 2 cols)');
    expect(state).toContain("Header A | Header B");
    expect(state).toContain("1 | 2");
    expect(state).toContain('Sheet "Empty" (0 rows × 0 cols)');
    expect(state).toContain("(empty)");
  });

  it("falls back to dev-mode text when Excel.run throws", async () => {
    installMockExcelWorkbook();
    g.Excel = { run: () => Promise.reject(new Error("Excel crashed")) };
    const state = await buildDocState();
    expect(state).toContain("Error reading workbook: Excel crashed");
  });
});

describe("buildExcelUserSelection (mocked Excel)", () => {
  it("renders the selected range when it has data", async () => {
    installMockExcelWorkbook();
    const selection = await buildUserSelection();
    expect(selection).toContain("<user_selection>");
    expect(selection).toContain("Range: C3:D4");
    expect(selection).toContain("x | y");
    expect(selection).toContain("z |");
  });

  it("returns empty string when the selection is blank", async () => {
    const { selectedRange } = installMockExcelWorkbook();
    selectedRange.values = [
      ["", ""],
      ["", ""],
    ];
    const selection = await buildUserSelection();
    expect(selection).toBe("");
  });
});
