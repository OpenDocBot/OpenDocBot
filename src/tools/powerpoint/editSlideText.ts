import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import {
  withSlideZip,
  getSlideXmlFromZip,
  setShapeText,
  parseShapeText,
  resolveSlideIndex,
  type ParsedParagraph,
  type ParsedRun,
} from "./pptx";

const editSlideText: ToolDefinition = {
  name: "edit_slide_text",
  host: "powerpoint",
  description:
    "Replace the styled text of a shape or table cell. FULL replacement — the provided paragraphs become the " +
    "target's entire text (pass one paragraph per line/bullet). " +
    "Each paragraph can carry per-run formatting: text, bold, italic, underline, size (pt), color (#RRGGBB), font name, and alignment. " +
    "Use read_slide_text first to capture formatting you want to keep. " +
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
      paragraphs: {
        type: "array",
        description:
          "The new paragraphs. Each is { runs: [{ text, bold?, italic?, underline?, size?, color?, font? }], alignment? }. " +
          "For simple plain text use [ { runs: [ { text: '...' } ] } ] — one entry per line.",
        items: {
          type: "object",
          properties: {
            runs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  bold: { type: "boolean" },
                  italic: { type: "boolean" },
                  underline: { type: "boolean" },
                  size: { type: "number", description: "Font size in points." },
                  color: { type: "string", description: "Hex color '#RRGGBB' or bare 'RRGGBB' (both accepted)." },
                  font: { type: "string", description: "Font name, e.g. 'Calibri'." },
                },
                required: ["text"],
              },
            },
            alignment: {
              type: "string",
              enum: ["l", "ctr", "r", "just"],
              description: "Paragraph alignment: l, ctr, r, just.",
            },
          },
          required: ["runs"],
        },
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Updating the slide title', 'Replacing body bullets'.",
      },
    },
    required: ["slide", "shape_id", "paragraphs"],
  },
};

toolRegistry.register(editSlideText, async (args) => {
  const slideRef = args.slide as string | undefined;
  const shapeId = args.shape_id as string | undefined;
  const rawParagraphs = args.paragraphs as ParsedParagraph[] | undefined;
  if (!slideRef || !shapeId || !Array.isArray(rawParagraphs)) {
    return JSON.stringify({ error: "slide, shape_id, and paragraphs are required." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);
        return withSlideZip(context, slideId, async ({ zip, markDirty, slidePath }) => {
          const xml = await getSlideXmlFromZip(zip);
          const edited = setShapeText(xml, shapeId, rawParagraphs);
          zip.file(slidePath, edited);
          markDirty();
          const paragraphs = parseShapeText(edited, shapeId);
          return {
            success: true,
            slide_id: slideId,
            shape_id: shapeId,
            paragraph_count: paragraphs.length,
            paragraphs,
          };
        });
      });
      const payload = {
        success: true,
        slide: slideRef,
        shape_id: shapeId,
        paragraph_count: (result.result as { paragraph_count?: number }).paragraph_count ?? 0,
        paragraphs: (result.result as { paragraphs?: ParsedParagraph[] }).paragraphs ?? [],
        ...(result.warning ? { warning: result.warning } : {}),
      };
      return JSON.stringify(payload);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    slide: slideRef,
    shape_id: shapeId,
    paragraphs: rawParagraphs.map((p) => ({
      runs: p.runs.map((r: ParsedRun) => ({ text: r.text })),
    })),
    dev_note: "[Dev mode] edit_slide_text",
  });
});
