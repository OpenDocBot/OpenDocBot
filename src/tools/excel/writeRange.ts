import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "./shared";

const writeRange: ToolDefinition = {
  name: "write_range",
  host: "excel",
  description:
    "Write values (or a single value) to a range on a worksheet. " +
    "data must be a 2D array matching the range shape, or a plain value to write into a single cell. " +
    "The range must already exist at the given address; pass clear=true to blank the range before writing.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address, e.g. 'A1:C5'. Required.",
      },
      data: {
        type: "array",
        items: { type: "array" },
        description: "2D array of values to write. Row-major: data[r][c] maps to cell (start_row + r, start_col + c).",
      },
      value: {
        type: ["string", "number", "boolean"],
        description: "Alternative to data: a single value to write to a one-cell range. May be a string, number or boolean.",
      },
      clear: {
        type: "boolean",
        description: "Clear the target range before writing. Default: true (safe overwrite).",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Writing project plan', 'Updating totals column'.",
      },
    },
    required: ["range_address"],
  },
};

toolRegistry.register(writeRange, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = parseRangeAddress(args.range_address as string);
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed.sheetName
        );
        const range = worksheet.getRange(parsed.address || (args.range_address as string));

        if (args.clear) {
          range.clear("All");
        }

        if (args.value !== undefined) {
          range.values = [[args.value]];
        } else if (Array.isArray(args.data)) {
          const data = args.data as (string | number | boolean | null)[][];
          const rowCount = data.length;
          const colCount = rowCount > 0 ? Math.max(...data.map((r) => r.length)) : 0;
          range.values = data.map((r) => {
            const row = [...r];
            while (row.length < colCount) row.push(null);
            return row;
          });
        } else {
          return { error: "data or value is required." };
        }

        worksheet.load("name");
        await context.sync();
        return {
          success: true,
          sheet_name: worksheet.name,
          range_address: args.range_address,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    dev_note: "[Dev mode] write_range",
  });
});
