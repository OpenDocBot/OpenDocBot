import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveSlideIndex } from "./pptx";

const removeSlideElement: ToolDefinition = {
  name: "remove_slide_element",
  host: "powerpoint",
  description:
    "Remove an element (shape, text box, image, group) from a slide by its shape id. " +
    "Call list_slide_shapes first to get the shape id. " +
    "Address the slide by 1-based position or slide id.",
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
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Removing a redundant box', 'Deleting a stray shape'.",
      },
    },
    required: ["slide", "shape_id"],
  },
};

toolRegistry.register(removeSlideElement, async (args) => {
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
        shape.delete();
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
    dev_note: "[Dev mode] remove_slide_element",
  });
});
