import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import {
  withSlideZip,
  getSlideXmlFromZip,
  parseSlideShapes,
  parseShapeText,
  resolveSlideIndex,
} from "./pptx";

const readSlide: ToolDefinition = {
  name: "read_slide",
  host: "powerpoint",
  description:
    "Retrieve the full content of a slide: every shape with its id, name, type, placeholder kind, " +
    "position/size, and styled text (paragraphs with per-run formatting), plus images and tables. " +
    "Address the slide by 1-based position (e.g. '2') or its slide id. " +
    "Use this to inspect a slide in detail before editing, or to verify a slide after edits.",
  parameters: {
    type: "object",
    properties: {
      slide: {
        type: "string",
        description: "1-based slide position (e.g. '2') or slide id. Required.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Reading slide 3 content', 'Verifying the edited slide'.",
      },
    },
    required: ["slide"],
  },
};

toolRegistry.register(readSlide, async (args) => {
  const slideRef = args.slide as string | undefined;
  if (!slideRef) {
    return JSON.stringify({ error: "slide is required (1-based position or slide id)." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);
        return withSlideZip(context, slideId, async ({ zip }) => {
          const xml = await getSlideXmlFromZip(zip);
          const shapes = parseSlideShapes(xml);

          // Attach styled text to text-bearing shapes.
          const elements = shapes.map((shape) => {
            if (shape.type === "image" || shape.type === "chart") {
              return shape;
            }
            try {
              const paragraphs = parseShapeText(xml, shape.id);
              return { ...shape, paragraphs: paragraphs.length > 0 ? paragraphs : undefined };
            } catch {
              return shape;
            }
          });

          return {
            slide: slideRef,
            slide_id: slideId,
            element_count: elements.length,
            elements,
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
    element_count: 2,
elements: [
      {
        id: "2",
        name: "Title 1",
        type: "shape",
        placeholder: "title",
        left: 36,
        top: 21.6,
        width: 648,
        height: 108,
        order: 0,
        paragraphs: [{ runs: [{ text: "Quarterly Review", bold: true, size: 44 }] }],
      },
      {
        id: "3",
        name: "Content Placeholder 2",
        type: "shape",
        placeholder: "body",
        left: 36,
        top: 137.7,
        width: 648,
        height: 288,
        order: 1,
        paragraphs: [
          { runs: [{ text: "Revenue grew 12% year over year." }] },
          { runs: [{ text: "Second bullet point." }] },
        ],
      },
    ],
    dev_note: "[Dev mode] read_slide",
  });
});
