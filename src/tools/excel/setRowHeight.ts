import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveWorksheet, normalizeRowRef } from "./shared";

const setRowHeight: ToolDefinition = {
  name: "set_row_height",
  host: "excel",
  description:
    "Set the height of one or more rows on a worksheet. Accepts a 1-based row index (e.g. 3) " +
    "or a range (e.g. '3:5') and a height in points. " +
    "Before resizing, call read_range to see the current row_heights, then pass an absolute value larger " +
    "(to increase) or smaller (to decrease) than the current height.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      rows: {
        type: "string",
        description: "Row reference, e.g. '3' or '3:5'. A bare number is treated as the whole row. Required.",
      },
      height: {
        type: "number",
        description: "Row height in points. Required.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Increasing header row height'.",
      },
    },
    required: ["rows", "height"],
  },
};

toolRegistry.register(setRowHeight, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const { worksheet, warning } = await resolveWorksheet(
          context,
          args.sheet_name as string | undefined
        );
        const rows = args.rows as string;
        const height = args.height as number;

        worksheet.getRange(normalizeRowRef(rows)).format.rowHeight = height;
        await context.sync();
        return {
          success: true,
          rows,
          height,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] set_row_height" });
});
