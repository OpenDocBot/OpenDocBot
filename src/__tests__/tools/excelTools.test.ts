import { describe, it, expect, beforeEach } from "vitest";
import { executeTool } from "../../tools/registry";

// Import registers the Excel tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

beforeEach(() => {
  g.Excel = undefined;
});

describe("Excel tools — dev mode", () => {
  it("list_worksheets returns sample data", async () => {
    const result = JSON.parse(await executeTool("list_worksheets", {}));
    expect(result.sheets).toBeDefined();
    expect(result.sheets.length).toBeGreaterThan(0);
    expect(result.active_sheet).toBeDefined();
  });

  it("read_range returns sample data", async () => {
    const result = JSON.parse(await executeTool("read_range", { range_address: "A1:B2" }));
    expect(result.address).toBe("A1:B2");
    expect(Array.isArray(result.data)).toBe(true);
    expect(Array.isArray(result.column_widths)).toBe(true);
    expect(Array.isArray(result.row_heights)).toBe(true);
    expect(result.column_widths.length).toBe(2);
    expect(result.row_heights.length).toBe(2);
  });

  it("write_range succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("write_range", { range_address: "A1", value: 42 }));
    expect(result.success).toBe(true);
  });

  it("format_range succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("format_range", { range_address: "A1", bold: true }));
    expect(result.success).toBe(true);
  });

  it("insert_rows_columns succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("insert_rows_columns", { target_type: "rows", index: 1 }));
    expect(result.success).toBe(true);
  });

  it("delete_rows_columns succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("delete_rows_columns", { target_type: "rows", index: 1 }));
    expect(result.success).toBe(true);
  });

  it("set_column_width succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("set_column_width", { columns: "A", width: 20 }));
    expect(result.success).toBe(true);
  });

  it("set_row_height succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("set_row_height", { rows: "1", height: 30 }));
    expect(result.success).toBe(true);
  });

  it("merge_cells succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("merge_cells", { range_address: "A1:F1" }));
    expect(result.success).toBe(true);
  });

  it("clear_range succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("clear_range", { range_address: "A1:C10" }));
    expect(result.success).toBe(true);
  });

  it("sort_range succeeds in dev mode", async () => {
    const result = JSON.parse(await executeTool("sort_range", { range_address: "A1:D10", sort_by_column: 0 }));
    expect(result.success).toBe(true);
  });
});

describe("Excel tools — dev mode parameter branches", () => {
  it("read_range accepts used_range and include_formulas", async () => {
    const result = JSON.parse(await executeTool("read_range", { used_range: true, include_formulas: true }));
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.address).toBe("A1:B2");
  });

  it("read_range honors a sheet_name qualifier in the address", async () => {
    const result = JSON.parse(await executeTool("read_range", { range_address: "Data!A1:B2" }));
    expect(result.address).toBe("A1:B2");
  });

  it("read_range honors sheet_name separately from the address", async () => {
    const result = JSON.parse(await executeTool("read_range", { sheet_name: "Data", range_address: "A1:B2" }));
    expect(result.address).toBe("A1:B2");
  });

  it("merge_cells supports unmerge and across", async () => {
    const unmerged = JSON.parse(await executeTool("merge_cells", { range_address: "A1:B1", action: "unmerge" }));
    expect(unmerged.success).toBe(true);

    const across = JSON.parse(await executeTool("merge_cells", { range_address: "A1:B1", across: true }));
    expect(across.success).toBe(true);
  });

  it("sort_range supports descending and headerless sorts", async () => {
    const desc = JSON.parse(
      await executeTool("sort_range", { range_address: "A1:D10", sort_by_column: 1, ascending: false })
    );
    expect(desc.success).toBe(true);

    const headerless = JSON.parse(
      await executeTool("sort_range", { range_address: "A1:D10", sort_by_column: 1, has_header: false })
    );
    expect(headerless.success).toBe(true);
  });

  it("insert_rows_columns and delete_rows_columns support columns", async () => {
    const inserted = JSON.parse(
      await executeTool("insert_rows_columns", { target_type: "columns", index: 2 })
    );
    expect(inserted.success).toBe(true);

    const deleted = JSON.parse(
      await executeTool("delete_rows_columns", { target_type: "columns", index: 2 })
    );
    expect(deleted.success).toBe(true);
  });

  it("format_range accepts every formatting parameter", async () => {
    const result = JSON.parse(
      await executeTool("format_range", {
        range_address: "A1:C1",
        font_name: "Arial",
        font_size: 14,
        bold: true,
        italic: true,
        font_color: "#FFFFFF",
        fill_color: "#4472C4",
        number_format: "#,##0.00",
        horizontal_alignment: "Center",
        vertical_alignment: "Top",
        border: "EdgeBottom",
        border_color: "#000000",
      })
    );
    expect(result.success).toBe(true);
  });

  it("clear_range succeeds for every what value", async () => {
    const contents = JSON.parse(await executeTool("clear_range", { range_address: "A1:C10", what: "contents" }));
    expect(contents.success).toBe(true);

    const formats = JSON.parse(await executeTool("clear_range", { range_address: "A1:C10", what: "formats" }));
    expect(formats.success).toBe(true);

    const all = JSON.parse(await executeTool("clear_range", { range_address: "A1:C10" }));
    expect(all.success).toBe(true);
  });

  it("set_column_width accepts a multi-column range", async () => {
    const result = JSON.parse(await executeTool("set_column_width", { columns: "A:C", width: 25 }));
    expect(result.success).toBe(true);
  });

  it("set_row_height accepts a multi-row range", async () => {
    const result = JSON.parse(await executeTool("set_row_height", { rows: "3:5", height: 30 }));
    expect(result.success).toBe(true);
  });

  it("write_range accepts data, value, and clear", async () => {
    const viaData = JSON.parse(
      await executeTool("write_range", { range_address: "A1:C2", data: [[1, 2, 3], [4, 5, 6]] })
    );
    expect(viaData.success).toBe(true);

    const viaValue = JSON.parse(await executeTool("write_range", { range_address: "A1", value: 42, clear: true }));
    expect(viaValue.success).toBe(true);
  });
});
