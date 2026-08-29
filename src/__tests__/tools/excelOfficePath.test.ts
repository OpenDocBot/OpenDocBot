import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool } from "../../tools/registry";

// Import registers the Excel tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRange(overrides: Record<string, unknown> = {}): any {
  return {
    address: "A1:B2",
    rowCount: 2,
    columnCount: 2,
    columnIndex: 0,
    rowIndex: 0,
    values: [
      ["a", "b"],
      ["c", "d"],
    ],
    formulas: [
      ["=a", "=b"],
      ["=c", "=d"],
    ],
    load: vi.fn(),
    clear: vi.fn(),
    merge: vi.fn(),
    unmerge: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    numberFormat: undefined,
    sort: { apply: vi.fn() },
    format: {
      columnWidth: 30,
      rowHeight: 20,
      font: {
        name: undefined,
        size: undefined,
        bold: undefined,
        italic: undefined,
        color: undefined,
        load: vi.fn(),
      },
      fill: { color: undefined },
      horizontalAlignment: undefined,
      verticalAlignment: undefined,
      borders: { getItem: vi.fn(() => ({ style: undefined, color: undefined })) },
      load: vi.fn(),
    },
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSheet(name: string, isNull = false): any {
  return {
    name,
    isNullObject: isNull,
    load: vi.fn(),
    getRange: (addr: string) => makeRange({ address: addr }),
    getUsedRange: () => makeRange({}),
    getRangeByIndexes: () => makeRange({}),
  };
}

function installExcelMock(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRangeFor?: (addr: string) => any;
  throwOnAddress?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedRange?: any;
} = {}) {
  const sync = vi.fn().mockResolvedValue(undefined);
  const activeSheet = makeSheet("Sheet1");

  const worksheetGetRange = (addr: string) => {
    if (options.throwOnAddress && addr === options.throwOnAddress) {
      throw new Error("Mock geometry read failure");
    }
    if (options.getRangeFor) return options.getRangeFor(addr);
    return makeRange({ address: addr });
  };

  const active = {
    ...activeSheet,
    getRange: worksheetGetRange,
  };

  const context = {
    workbook: {
      name: "Book1",
      worksheets: {
        getActiveWorksheet: () => active,
        getItemOrNullObject: (name: string) => makeSheet(name, true),
        items: [active],
        load: vi.fn(),
      },
      getSelectedRange: () => options.selectedRange ?? makeRange({}),
    },
    sync,
  };

  g.Office = {
    onReady: () => {},
    context: { host: "Excel" },
    HostType: { Word: "Word", Excel: "Excel" },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.Excel = { run: (fn: any) => fn(context) };

  return { active, context, sync };
}

beforeEach(() => {
  g.Office = undefined;
  g.Excel = undefined;
});

afterEach(() => {
  g.Office = undefined;
  g.Excel = undefined;
});

describe("read_range — mocked Excel office path", () => {
  it("returns data, address, and populated geometry arrays", async () => {
    installExcelMock({
      getRangeFor: (addr: string) =>
        makeRange({
          address: addr,
          rowCount: 2,
          columnCount: 2,
          values: [[1, 2], [3, 4]],
        }),
    });
    const result = JSON.parse(await executeTool("read_range", { range_address: "A1:B2" }));
    expect(result.address).toBe("A1:B2");
    expect(result.data).toEqual([[1, 2], [3, 4]]);
    expect(result.column_widths).toEqual([30, 30]);
    expect(result.row_heights).toEqual([20, 20]);
  });

  it("returns formulas when include_formulas is set", async () => {
    installExcelMock({
      getRangeFor: (addr: string) =>
        makeRange({ address: addr, values: [[1]], formulas: [["=SUM(A1:A3)"]] }),
    });
    const result = JSON.parse(
      await executeTool("read_range", { range_address: "A1", include_formulas: true })
    );
    expect(result.data).toEqual([["=SUM(A1:A3)"]]);
  });

  it("errors when the range exceeds max_cells", async () => {
    installExcelMock({
      getRangeFor: (addr: string) =>
        makeRange({ address: addr, rowCount: 1000, columnCount: 4 }),
    });
    const result = JSON.parse(await executeTool("read_range", { range_address: "A1:D1000" }));
    expect(result.error).toContain("exceeds max_cells=1000");
  });

  it("degrades to empty geometry arrays when the geometry read fails (merged cells)", async () => {
    installExcelMock({ throwOnAddress: "A:A" });
    const result = JSON.parse(await executeTool("read_range", { range_address: "A1:B2" }));
    expect(result.address).toBe("A1:B2");
    expect(result.column_widths).toEqual([]);
    expect(result.row_heights).toEqual([]);
    expect(result.data).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("errors when neither range_address nor used_range is provided", async () => {
    installExcelMock();
    const result = JSON.parse(await executeTool("read_range", {}));
    expect(result.error).toContain("range_address or used_range is required");
  });

  it("reads the used range when used_range is set", async () => {
    const { active } = installExcelMock();
    const used = makeRange({ address: "$A$1:$D$10", rowCount: 10, columnCount: 4 });
    active.getUsedRange = () => used;
    const result = JSON.parse(await executeTool("read_range", { used_range: true }));
    expect(result.address).toBe("$A$1:$D$10");
    expect(result.rows).toBe(10);
  });

  it("honors sheet_name and includes a warning when the sheet is missing", async () => {
    const { context } = installExcelMock();
    context.workbook.worksheets.getItemOrNullObject = (name: string) => {
      if (name === "Data") return makeSheet("Data", false);
      return makeSheet(name, true);
    };
    context.workbook.worksheets.items = [makeSheet("Sheet1"), makeSheet("Data")];
    const result = JSON.parse(
      await executeTool("read_range", { sheet_name: "Data", range_address: "A1" })
    );
    expect(result.sheet_name).toBe("Data");
    expect(result.warning).toBeUndefined();

    const fallback = JSON.parse(
      await executeTool("read_range", { sheet_name: "Nope", range_address: "A1" })
    );
    expect(fallback.warning).toContain('Worksheet "Nope" not found');
    expect(fallback.warning).toContain("Available worksheets");
  });
});

describe("Excel mutation tools — mocked office path", () => {
  it("set_column_width normalizes a bare letter to A:A", async () => {
    const { active } = installExcelMock();
    const getRangeSpy = vi.fn((addr: string) => makeRange({ address: addr }));
    active.getRange = getRangeSpy;
    const result = JSON.parse(await executeTool("set_column_width", { columns: "a", width: 40 }));
    expect(getRangeSpy).toHaveBeenCalledWith("A:A");
    expect(result.success).toBe(true);
    expect(result.columns).toBe("a");
  });

  it("set_row_height normalizes a bare number to 3:3", async () => {
    const { active } = installExcelMock();
    const getRangeSpy = vi.fn((addr: string) => makeRange({ address: addr }));
    active.getRange = getRangeSpy;
    const result = JSON.parse(await executeTool("set_row_height", { rows: "3", height: 45 }));
    expect(getRangeSpy).toHaveBeenCalledWith("3:3");
    expect(result.success).toBe(true);
  });

  it("merge_cells unmerges when action is unmerge", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    const result = JSON.parse(
      await executeTool("merge_cells", { range_address: "A1:B1", action: "unmerge" })
    );
    expect(range.unmerge).toHaveBeenCalled();
    expect(range.merge).not.toHaveBeenCalled();
    expect(result.action).toBe("unmerge");
  });

  it("merge_cells merges across when across is set", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("merge_cells", { range_address: "A1:B1", across: true });
    expect(range.merge).toHaveBeenCalledWith(true);
  });

  it("sort_range applies descending sort with no header row", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("sort_range", {
      range_address: "A1:D10",
      sort_by_column: 1,
      ascending: false,
      has_header: false,
    });
    expect(range.sort.apply).toHaveBeenCalledWith(
      [{ key: 1, ascending: false, sortOn: "Value" }],
      false
    );
  });

  it("insert_rows_columns inserts columns", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRangeByIndexes = () => range;
    active.getUsedRange = () => makeRange({ rowCount: 10, columnCount: 4 });
    const result = JSON.parse(
      await executeTool("insert_rows_columns", { target_type: "columns", index: 2, count: 3 })
    );
    expect(range.insert).toHaveBeenCalledWith("Right");
    expect(result.target_type).toBe("columns");
  });

  it("delete_rows_columns deletes columns shifting left", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRangeByIndexes = () => range;
    active.getUsedRange = () => makeRange({ rowCount: 10, columnCount: 4 });
    const result = JSON.parse(
      await executeTool("delete_rows_columns", { target_type: "columns", index: 2 })
    );
    expect(range.delete).toHaveBeenCalledWith("Left");
    expect(result.target_type).toBe("columns");
  });

  it("format_range applies border color to the requested edge", async () => {
    const { active } = installExcelMock();
    const border = { style: undefined, color: undefined };
    const range = makeRange({ format: { ...makeRange().format, borders: { getItem: () => border } } });
    active.getRange = () => range;
    await executeTool("format_range", {
      range_address: "A1:C1",
      border: "EdgeBottom",
      border_color: "#4472C4",
    });
    expect(border.style).toBe("Continuous");
    expect(border.color).toBe("#4472C4");
  });

  it("clear_range passes through the what argument", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("clear_range", { range_address: "A1:C10", what: "contents" });
    expect(range.clear).toHaveBeenCalledWith("Contents");

    range.clear.mockClear();
    await executeTool("clear_range", { range_address: "A1:C10", what: "formats" });
    expect(range.clear).toHaveBeenCalledWith("Formats");

    range.clear.mockClear();
    await executeTool("clear_range", { range_address: "A1:C10" });
    expect(range.clear).toHaveBeenCalledWith("All");
  });

  it("write_range pads ragged data rows with nulls", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("write_range", { range_address: "A1:C2", data: [[1], [2, 3, 4]] });
    expect(range.values).toEqual([[1, null, null], [2, 3, 4]]);
  });

  it("write_range writes a scalar value", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("write_range", { range_address: "A1", value: 42 });
    expect(range.values).toEqual([[42]]);
  });

  it("write_range clears the range when clear is set", async () => {
    const { active } = installExcelMock();
    const range = makeRange({});
    active.getRange = () => range;
    await executeTool("write_range", { range_address: "A1", value: 1, clear: true });
    expect(range.clear).toHaveBeenCalledWith("All");
  });

  it("write_range errors when neither data nor value is provided", async () => {
    installExcelMock();
    const result = JSON.parse(await executeTool("write_range", { range_address: "A1" }));
    expect(result.error).toContain("data or value is required");
  });
});
