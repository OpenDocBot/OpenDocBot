import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "./shared";

const clearRange: ToolDefinition = {
  name: "clear_range",
  host: "excel",
  description:
    "Clear the contents and/or formatting of a range. Use 'contents' to remove values, " +
    "'formats' to reset formatting only, or 'all' (default) for both. The range itself stays.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address to clear, e.g. 'A1:C10'. Required.",
      },
      what: {
        type: "string",
        enum: ["all", "contents", "formats"],
        description: "What to clear. Default: all.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Clearing scratch area', 'Resetting formatting'.",
      },
    },
    required: ["range_address"],
  },
};

toolRegistry.register(clearRange, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = parseRangeAddress(args.range_address as string);
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed.sheetName
        );
        const range = worksheet.getRange(parsed.address || (args.range_address as string));

        const what = args.what as string | undefined;
        if (what === "contents") range.clear("Contents");
        else if (what === "formats") range.clear("Formats");
        else range.clear("All");

        await context.sync();
        return {
          success: true,
          range_address: args.range_address,
          what: args.what || "all",
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] clear_range" });
});
