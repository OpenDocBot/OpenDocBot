import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveSlideIndex } from "./pptx";

const formatShape: ToolDefinition = {
  name: "format_shape",
  host: "powerpoint",
  description:
    "Format a shape on a slide: font (name, size, bold, italic, color), fill color, " +
    "horizontal text alignment, and position/size in points. Only provided properties are changed. " +
    "Address the slide by 1-based position or slide id; shape_id from list_slide_shapes.",
  parameters: {
    type: "object",
    properties: {
      slide: {
        type: "string",
        description: "1-based slide position or slide id. Required.",
      },
      shape_id: {
        type: "string",
        description: "Shape id from list_slide_shapes. Required.",
      },
      font_name: {
        type: "string",
        description: "Font name, e.g. 'Calibri', 'Arial'.",
      },
      font_size: {
        type: "number",
        description: "Font size in points.",
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
        description: "Font color as hex '#RRGGBB'.",
      },
      fill_color: {
        type: "string",
        description: "Shape fill color as hex '#RRGGBB'.",
      },
      horizontal_alignment: {
        type: "string",
        enum: ["Left", "Center", "Right"],
        description: "Horizontal text alignment.",
      },
      left: {
        type: "number",
        description: "Left position in points.",
      },
      top: {
        type: "number",
        description: "Top position in points.",
      },
      width: {
        type: "number",
        description: "Width in points.",
      },
      height: {
        type: "number",
        description: "Height in points.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Bolding the title', 'Changing the box fill to blue'.",
      },
    },
    required: ["slide", "shape_id"],
  },
};

toolRegistry.register(formatShape, async (args) => {
  const slideRef = args.slide as string | undefined;
  const shapeId = args.shape_id as string | undefined;
  if (!slideRef || !shapeId) {
    return JSON.stringify({ error: "slide and shape_id are required." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);
        const slide = context.presentation.slides.getItem(slideId);
        const shape = slide.shapes.getItem(shapeId);

        if (args.left !== undefined) shape.left = args.left as number;
        if (args.top !== undefined) shape.top = args.top as number;
        if (args.width !== undefined) shape.width = args.width as number;
        if (args.height !== undefined) shape.height = args.height as number;

        if (args.fill_color !== undefined) {
          shape.fill.setSolidColor(args.fill_color as string);
        }

        if (
          args.font_name !== undefined || args.font_size !== undefined ||
          args.bold !== undefined || args.italic !== undefined ||
          args.font_color !== undefined
        ) {
          const font = shape.textFrame.textRange.font;
          if (args.font_name !== undefined) font.name = args.font_name as string;
          if (args.font_size !== undefined) font.size = args.font_size as number;
          if (args.bold !== undefined) font.bold = args.bold as boolean;
          if (args.italic !== undefined) font.italic = args.italic as boolean;
          if (args.font_color !== undefined) font.color = args.font_color as string;
        }

        if (args.horizontal_alignment !== undefined) {
          shape.textFrame.textRange.paragraphFormat.horizontalAlignment =
            args.horizontal_alignment as PowerPoint.ParagraphHorizontalAlignment;
        }

        await context.sync();
        return { success: true, slide_id: slideId, shape_id: shapeId };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    slide: slideRef,
    shape_id: shapeId,
    dev_note: "[Dev mode] format_shape",
  });
});
