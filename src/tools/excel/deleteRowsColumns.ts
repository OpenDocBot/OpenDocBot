import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveWorksheet } from "./shared";

const deleteRowsColumns: ToolDefinition = {
  name: "delete_rows_columns",
  host: "excel",
  description:
    "Delete rows or columns from a worksheet. For rows, provide the 1-based row index and optional count. " +
    "For columns, provide the 1-based column index and optional count. Remaining data shifts up/left.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      target_type: {
        type: "string",
        enum: ["rows", "columns"],
        description: "Whether to delete rows or columns. Required.",
      },
      index: {
        type: "number",
        description: "1-based row or column index where deletion starts. Required.",
      },
      count: {
        type: "number",
        description: "How many rows/columns to delete. Default: 1.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Deleting empty row 12', 'Removing obsolete column D'.",
      },
    },
    required: ["target_type", "index"],
  },
};

toolRegistry.register(deleteRowsColumns, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const { worksheet, warning } = await resolveWorksheet(
          context,
          args.sheet_name as string | undefined
        );
        const index = args.index as number;
        const count = Math.min(Math.max((args.count as number) || 1, 1), 100);

        const used = worksheet.getUsedRange();
        used.load("rowCount, columnCount");
        await context.sync();

        if (args.target_type === "columns") {
          worksheet.getRangeByIndexes(0, index, used.rowCount || 1, count).delete("Left");
        } else {
          worksheet.getRangeByIndexes(index, 0, count, used.columnCount || 1).delete("Up");
        }

        await context.sync();
        return {
          success: true,
          target_type: args.target_type,
          index,
          count,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] delete_rows_columns" });
});
