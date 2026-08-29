import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const listWorksheets: ToolDefinition = {
  name: "list_worksheets",
  host: "excel",
  description:
    "List all worksheets in the workbook with the active sheet and each sheet's used-range dimensions (rows x columns). " +
    "Call this first to understand the workbook structure before reading or writing ranges.",
  parameters: {
    type: "object",
    properties: {
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Listing sheets in the workbook', 'Checking workbook structure'.",
      },
    },
  },
};

toolRegistry.register(listWorksheets, async () => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const workbook = context.workbook;
        const worksheets = workbook.worksheets;
        worksheets.load("items/name");
        workbook.load("name");
        await context.sync();

        const sheets = worksheets.items.map((ws) => {
          const usedRange = ws.getUsedRange();
          usedRange.load("rowCount, columnCount");
          return { ws, usedRange };
        });

        const active = workbook.worksheets.getActiveWorksheet();
        active.load("name");
        await context.sync();

        return {
          workbook_name: workbook.name,
          active_sheet: active.name,
          sheets: sheets.map((s) => ({
            name: s.ws.name,
            used_rows: s.usedRange.rowCount,
            used_columns: s.usedRange.columnCount,
          })),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    workbook_name: "Book1",
    active_sheet: "Sheet1",
    sheets: [
      { name: "Sheet1", used_rows: 10, used_columns: 4 },
      { name: "Sheet2", used_rows: 0, used_columns: 0 },
    ],
    dev_note: "[Dev mode] list_worksheets",
  });
});
