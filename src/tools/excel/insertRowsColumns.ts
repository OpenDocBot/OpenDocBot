import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveWorksheet } from "./shared";

const insertRowsColumns: ToolDefinition = {
  name: "insert_rows_columns",
  host: "excel",
  description:
    "Insert rows or columns into a worksheet. For rows, provide the 1-based row index to insert at " +
    "(new rows are placed above it). For columns, provide the column letter or 1-based column index " +
    "(new columns are placed to the left). Existing data shifts down/right.",
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
        description: "Whether to insert rows or columns. Required.",
      },
      index: {
        type: "number",
        description: "1-based row or column index where the insertion happens. Required.",
      },
      count: {
        type: "number",
        description: "How many rows/columns to insert. Default: 1.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Inserting a row above the header', 'Adding a column for totals'.",
      },
    },
    required: ["target_type", "index"],
  },
};

toolRegistry.register(insertRowsColumns, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const { worksheet, warning } = await resolveWorksheet(
          context,
          args.sheet_name as string | undefined
        );
        const index = args.index as number;
        const count = Math.min(Math.max((args.count as number) || 1, 1), 100);

        if (args.target_type === "columns") {
          worksheet.getRangeByIndexes(0, index, worksheet.getUsedRange().rowCount || 1, count)
            .insert("Right");
        } else {
          worksheet.getRangeByIndexes(index, 0, count, worksheet.getUsedRange().columnCount || 1)
            .insert("Down");
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

  return JSON.stringify({ success: true, dev_note: "[Dev mode] insert_rows_columns" });
});
