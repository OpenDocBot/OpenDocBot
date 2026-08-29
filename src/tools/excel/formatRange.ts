import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "./shared";

const formatRange: ToolDefinition = {
  name: "format_range",
  host: "excel",
  description:
    "Apply formatting to a range: font (name, size, bold, italic, color), fill color, number format, " +
    "horizontal alignment, and border style. Only provided properties are changed — others are left untouched. " +
    "Number format uses Excel format codes, e.g. '#,##0.00', '0%', 'mm/dd/yyyy', '@' for text.",
  parameters: {
    type: "object",
    properties: {
      sheet_name: {
        type: "string",
        description: "Worksheet name. Omit to use the active sheet.",
      },
      range_address: {
        type: "string",
        description: "A1 notation address, e.g. 'A1:C1' for a header row. Required.",
      },
      font_name: {
        type: "string",
        description: "Font name, e.g. 'Calibri', 'Arial'.",
      },
      font_size: {
        type: "number",
        description: "Font size in points, e.g. 14.",
      },
      bold: {
        type: "boolean",
        description: "Bold the text.",
      },
      italic: {
        type: "boolean",
        description: "Italicize the text.",
      },
      font_color: {
        type: "string",
        description: "Font color as hex '#RRGGBB' or named color, e.g. '#FFFFFF'.",
      },
      fill_color: {
        type: "string",
        description: "Fill color as hex '#RRGGBB' or named color, e.g. '#4472C4'.",
      },
      number_format: {
        type: "string",
        description: "Excel number format code, e.g. '#,##0.00', '0%', 'mm/dd/yyyy'.",
      },
      horizontal_alignment: {
        type: "string",
        enum: ["Left", "Center", "Right", "General"],
        description: "Horizontal text alignment.",
      },
      vertical_alignment: {
        type: "string",
        enum: ["Top", "Center", "Bottom"],
        description: "Vertical text alignment.",
      },
      border: {
        type: "string",
        enum: ["EdgeLeft", "EdgeTop", "EdgeBottom", "EdgeRight", "InsideVertical", "InsideHorizontal"],
        description: "Border edge to apply the style to.",
      },
      border_color: {
        type: "string",
        description: "Border color as hex '#RRGGBB'.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Bold header row', 'Color totals column orange'.",
      },
    },
    required: ["range_address"],
  },
};

toolRegistry.register(formatRange, async (args) => {
  if (isInsideOffice() && typeof Excel !== "undefined") {
    try {
      const result = await Excel.run(async (context) => {
        const parsed = parseRangeAddress(args.range_address as string);
        const { worksheet, warning } = await resolveWorksheet(
          context,
          (args.sheet_name as string | undefined) ?? parsed.sheetName
        );
        const range = worksheet.getRange(parsed.address || (args.range_address as string));

        if (args.font_name !== undefined) range.format.font.name = args.font_name as string;
        if (args.font_size !== undefined) range.format.font.size = args.font_size as number;
        if (args.bold !== undefined) range.format.font.bold = args.bold as boolean;
        if (args.italic !== undefined) range.format.font.italic = args.italic as boolean;
        if (args.font_color !== undefined) range.format.font.color = args.font_color as string;
        if (args.fill_color !== undefined) range.format.fill.color = args.fill_color as string;
        if (args.number_format !== undefined) {
          range.numberFormat = args.number_format as never;
        }
        if (args.horizontal_alignment !== undefined) {
          range.format.horizontalAlignment = args.horizontal_alignment as Excel.HorizontalAlignment;
        }
        if (args.vertical_alignment !== undefined) {
          range.format.verticalAlignment = args.vertical_alignment as Excel.VerticalAlignment;
        }
        if (args.border !== undefined) {
          const border = range.format.borders.getItem(args.border as Excel.BorderIndex);
          border.style = "Continuous";
          if (args.border_color !== undefined) border.color = args.border_color as string;
        }

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

  return JSON.stringify({
    success: true,
    dev_note: "[Dev mode] format_range",
  });
});
