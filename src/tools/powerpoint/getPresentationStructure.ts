import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const getPresentationStructure: ToolDefinition = {
  name: "get_presentation_structure",
  host: "powerpoint",
  description:
    "Get an overview of the presentation structure: slide count, and for each slide its 1-based position, " +
    "slide id, layout name, shape count, and a short title (first text shape). " +
    "Call this first to understand the deck before reading or editing slides. " +
    "Positions are 1-based and change when slides are added/deleted/moved — always re-read after structural edits.",
  parameters: {
    type: "object",
    properties: {
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Listing deck structure', 'Checking presentation outline'.",
      },
    },
  },
};

toolRegistry.register(getPresentationStructure, async () => {
  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items/id");
        await context.sync();

        const outline: {
          position: number;
          slideId: string;
          layout: string;
          elementCount: number;
          title: string;
        }[] = [];

        for (let i = 0; i < slides.items.length; i++) {
          const slide = slides.items[i];
          const shapes = slide.shapes;
          shapes.load("items/id, items/name, items/type, items/textFrame/textRange/text");
          const layout = slide.layout;
          layout.load("name");
          await context.sync();

          const elementCount = shapes.items.length;
          let title = "";
          for (const shape of shapes.items) {
            const text = shape.textFrame?.textRange?.text?.trim() ?? "";
            if (text) {
              title = text.length > 120 ? text.slice(0, 120) + "…" : text;
              break;
            }
          }

          outline.push({
            position: i + 1,
            slideId: slide.id,
            layout: layout.name || "",
            elementCount,
            title,
          });
        }

        return { total_slides: outline.length, slides: outline };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    total_slides: 2,
    slides: [
      { position: 1, slideId: "256", layout: "Title Slide", elementCount: 2, title: "Quarterly Review" },
      { position: 2, slideId: "257", layout: "Title and Content", elementCount: 3, title: "Revenue Trends" },
    ],
    dev_note: "[Dev mode] get_presentation_structure",
  });
});
