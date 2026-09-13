import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { withSlideZip, getSlideXmlFromZip, parseShapeText, resolveSlideIndex } from "./pptx";

const readSlideText: ToolDefinition = {
  name: "read_slide_text",
  host: "powerpoint",
  description:
    "Read the styled text of a shape or table cell as structured paragraphs and runs. " +
    "Each run carries its own formatting (bold, italic, size, color, font, alignment). " +
    "Use this before edit_slide_text to preserve formatting you don't intend to change. " +
    "Call list_slide_shapes first to get the shape id. " +
    "For a TABLE, pass cell_row / cell_col (0-based) to read one cell. " +
    "Returns an error when the element is not text-bearing (image, connector).",
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
      cell_row: {
        type: "number",
        description: "For table cells: 0-based row index.",
      },
      cell_col: {
        type: "number",
        description: "For table cells: 0-based column index.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Reading title text', 'Checking body bullets'.",
      },
    },
    required: ["slide", "shape_id"],
  },
};

toolRegistry.register(readSlideText, async (args) => {
  const slideRef = args.slide as string | undefined;
  const shapeId = args.shape_id as string | undefined;
  if (!slideRef || !shapeId) {
    return JSON.stringify({ error: "slide and shape_id are required." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);
        return withSlideZip(context, slideId, async ({ zip }) => {
          const xml = await getSlideXmlFromZip(zip);
          const paragraphs = parseShapeText(xml, shapeId);
          return {
            slide: slideRef,
            slide_id: slideId,
            shape_id: shapeId,
            paragraph_count: paragraphs.length,
            paragraphs,
          };
        });
      });
      return JSON.stringify(result.result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    slide: slideRef,
    slide_id: "256",
    shape_id: shapeId,
    paragraph_count: 2,
    paragraphs: [
      {
        runs: [{ text: "Quarterly Review", bold: true, size: 44, color: "1F4E79" }],
        alignment: "l",
      },
      {
        runs: [{ text: "Revenue grew ", size: 18 }, { text: "12%", bold: true, size: 18 }],
      },
    ],
    dev_note: "[Dev mode] read_slide_text",
  });
});
