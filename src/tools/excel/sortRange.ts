import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "./shared";

const sortRange: ToolDefinition = {
  name: "sort_range",
  host: "excel",
  description:
    "Sort a range by one or more columns. Provide the A1 address of the range to sort and the " +
    "0-based column index (within the range) to sort by. Specify a header row so it stays in place.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address of the range to sort, e.g. 'A1:D10'. Required.",
      },
      sort_by_column: {
        type: "number",
        description: "0-based column index within the range to sort by. Required.",
      },
      ascending: {
        type: "boolean",
        description: "Sort ascending (default true) or descending.",
      },
      has_header: {
        type: "boolean",
        description: "First row is a header and stays in place. Default: true.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Sorting data by revenue', 'Sorting list alphabetically'.",
      },
    },
    required: ["range_address", "sort_by_column"],
  },
};

toolRegistry.register(sortRange, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = parseRangeAddress(args.range_address as string);
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed.sheetName
        );
        const range = worksheet.getRange(parsed.address || (args.range_address as string));

        const sortFields: Excel.SortField[] = [
          {
            key: args.sort_by_column as number,
            ascending: args.ascending !== false,
            sortOn: "Value",
          },
        ];

        range.sort.apply(sortFields, args.has_header !== false);
        await context.sync();
        return {
          success: true,
          range_address: args.range_address,
          ...(warning ? { warning } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] sort_range" });
});
