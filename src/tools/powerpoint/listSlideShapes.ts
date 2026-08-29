import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { withSlideZip, getSlideXmlFromZip, parseSlideShapes, resolveSlideIndex } from "./pptx";

const listSlideShapes: ToolDefinition = {
  name: "list_slide_shapes",
  host: "powerpoint",
  description:
    "List every element on a slide: shape id, name, type (shape / image / table / group / chart), " +
    "placeholder kind (TITLE, SUBTITLE, BODY, …) when applicable, position/size in points, a short text preview, " +
    "and stacking order (order: 0 is the back of the stack, highest is the front). " +
    "GROUP children are listed inline with parent_id set — target the child's shape id directly. " +
    "Call this before read_slide_text or edit_slide_text to obtain the shape id those tools require. " +
    "Address the slide by 1-based position (e.g. '2') or its slide id.",
  parameters: {
    type: "object",
    properties: {
      slide: {
        type: "string",
        description: "1-based slide position (e.g. '2') or slide id. Required.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Listing shapes on slide 3', 'Checking slide layout elements'.",
      },
    },
    required: ["slide"],
  },
};

toolRegistry.register(listSlideShapes, async (args) => {
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
          return {
            slide: slideRef,
            slide_id: slideId,
            shape_count: shapes.length,
            shapes,
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
    shape_count: 2,
    shapes: [
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
        textPreview: "Quarterly Review",
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
        textPreview: "Key metrics from the quarter.",
      },
    ],
    dev_note: "[Dev mode] list_slide_shapes",
  });
});
