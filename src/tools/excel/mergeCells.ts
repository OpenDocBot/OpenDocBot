import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "./shared";

const mergeCells: ToolDefinition = {
  name: "merge_cells",
  host: "excel",
  description:
    "Merge or unmerge a range of cells on a worksheet. Use for title banners or multi-column headers. " +
    "Unmerging restores the individual cells.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address to merge/unmerge, e.g. 'A1:F1'. Required.",
      },
      action: {
        type: "string",
        enum: ["merge", "unmerge"],
        description: "merge (default) or unmerge.",
      },
      across: {
        type: "boolean",
        description: "Merge across (row-wise, keeping rows) instead of full merge. Default: false.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Merging title across columns', 'Unmerging header cells'.",
      },
    },
    required: ["range_address"],
  },
};

toolRegistry.register(mergeCells, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = parseRangeAddress(args.range_address as string);
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed.sheetName
        );
        const range = worksheet.getRange(parsed.address || (args.range_address as string));

        if (args.action === "unmerge") {
          range.unmerge();
        } else if (args.across) {
          range.merge(true);
        } else {
          range.merge();
        }

        await context.sync();
        return {
          success: true,
          range_address: args.range_address,
          action: args.action || "merge",
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] merge_cells" });
});
