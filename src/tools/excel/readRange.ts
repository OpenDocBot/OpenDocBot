import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet, columnLetter } from "./shared";

const readRange: ToolDefinition = {
  name: "read_range",
  host: "excel",
  description:
    "Read cell values (and optionally formulas) from a range on a worksheet. " +
    "Returns a 2D array matching the range shape (rows x columns), plus the address. " +
    "Also reports current column_widths and row_heights so you can pick an appropriate absolute value when resizing. " +
    "Empty cells come back as null. Use A1 notation like 'A1:C5'.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address, e.g. 'A1:C5' or 'A1'. Required unless reading the used range.",
      },
      used_range: {
        type: "boolean",
        description: "Set true to read the entire used range of the sheet instead of providing range_address.",
      },
      include_formulas: {
        type: "boolean",
        description: "Return formulas (e.g. '=SUM(A1:A3)') instead of computed values. Default: false.",
      },
      max_cells: {
        type: "number",
        description: "Safety cap on the number of cells read (default 1000) to avoid huge payloads.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Reading sales data', 'Checking column values'.",
      },
    },
  },
};

toolRegistry.register(readRange, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = args.range_address ? parseRangeAddress(args.range_address as string) : null;
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed?.sheetName
        );

        const maxCells = Math.min(Math.max((args.max_cells as number) || 1000, 1), 100000);
        let range: Excel.Range;
        if (args.used_range) {
          range = worksheet.getUsedRange();
        } else if (parsed && parsed.address) {
          range = worksheet.getRange(parsed.address);
        } else if (args.range_address) {
          range = worksheet.getRange(args.range_address as string);
        } else {
          return { error: "range_address or used_range is required." };
        }

        worksheet.load("name");
        range.load("address, rowCount, columnCount, columnIndex, rowIndex");
        range.load("values");
        range.load("formulas");
        await context.sync();

        const cells = range.rowCount * range.columnCount;
        if (cells > maxCells) {
          return {
            error: `Range ${range.address} has ${cells} cells (exceeds max_cells=${maxCells}). Read a smaller range.`,
          };
        }

        const data = args.include_formulas ? range.formulas : range.values;

        // Report current geometry (bounded, best-effort). Whole-column/whole-row
        // references ("A:A", "1:1") work reliably even with merged cells; a
        // failure must never break the read — degrade to empty arrays instead.
        let column_widths: (number | null)[] = [];
        let row_heights: (number | null)[] = [];
        try {
          const maxGeometryColumns = Math.min(range.columnCount, 12);
          const maxGeometryRows = Math.min(range.rowCount, 12);
          const colRanges: { letter: string; range: Excel.Range }[] = [];
          const rowRanges: { rowNum: string; range: Excel.Range }[] = [];
          for (let c = 0; c < maxGeometryColumns; c++) {
            const letter = columnLetter(range.columnIndex + c);
            const r = worksheet.getRange(`${letter}:${letter}`);
            r.format.load("columnWidth");
            colRanges.push({ letter, range: r });
          }
          for (let r = 0; r < maxGeometryRows; r++) {
            const rowNum = range.rowIndex + r + 1;
            const rr = worksheet.getRange(`${rowNum}:${rowNum}`);
            rr.format.load("rowHeight");
            rowRanges.push({ rowNum: String(rowNum), range: rr });
          }
          await context.sync();

          column_widths = colRanges.map(({ range }) => range.format.columnWidth);
          row_heights = rowRanges.map(({ range }) => range.format.rowHeight);
        } catch {
          // Geometry is informational — never fail the read over it.
        }

        return {
          sheet_name: worksheet.name,
          address: range.address,
          rows: range.rowCount,
          columns: range.columnCount,
          data,
          column_widths,
          row_heights,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    sheet_name: "Sheet1",
    address: "A1:B2",
    rows: 2,
    columns: 2,
    data: [
      ["Header A", "Header B"],
      [1, 2],
    ],
    column_widths: [8.43, 8.43],
    row_heights: [15, 15],
    dev_note: "[Dev mode] read_range",
  });
});
