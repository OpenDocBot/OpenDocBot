import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveWorksheet, normalizeColumnRef } from "./shared";

const setColumnWidth: ToolDefinition = {
  name: "set_column_width",
  host: "excel",
  description:
    "Set the width of one or more columns on a worksheet. Accepts a single column letter (e.g. 'A') " +
    "or a range (e.g. 'A:C') and a width in character units. " +
    "Before resizing, call read_range to see the current column_widths, then pass an absolute value larger " +
    "(to widen) or smaller (to narrow) than the current width.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      columns: {
        type: "string",
        description: "Column letter(s), e.g. 'A' or 'A:C'. A bare letter is treated as the whole column. Required.",
      },
      width: {
        type: "number",
        description: "Column width in character units. Required.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Widening the Name column', 'Fitting columns to content'.",
      },
    },
    required: ["columns", "width"],
  },
};

toolRegistry.register(setColumnWidth, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const { worksheet, warning } = await resolveWorksheet(
          context,
          args.sheet_name as string | undefined
        );
        const columns = args.columns as string;
        const width = args.width as number;

        worksheet.getRange(normalizeColumnRef(columns)).format.columnWidth = width;
        await context.sync();
        return {
          success: true,
          columns,
          width,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] set_column_width" });
});
