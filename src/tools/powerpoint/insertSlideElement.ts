import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import {
  resolveSlideIndex,
  withSlideZip,
  getSlideXmlFromZip,
  parseSlideShapes,
  moveShapeToBack,
  exportSlideXmlById,
} from "./pptx";

const SLIDE_WIDTH = 960; // 13.33in in points (16:9)
const SLIDE_HEIGHT = 540; // 7.5in in points

const insertSlideElement: ToolDefinition = {
  name: "insert_slide_element",
  host: "powerpoint",
  description:
    "Insert a new element on a slide: a text box, a geometric shape (rectangle, arrow, ellipse, etc.), " +
    "or a straight line. Positions are in points from the top-left of the slide; defaults center the element. " +
    "Address the slide by 1-based position or slide id. " +
    "Full-bleed shapes (covering nearly the whole slide) are treated as backgrounds and automatically " +
    "placed at the back of the stacking order behind existing content. Use z_order to force front/back. " +
    "Returns the new shape's id (after re-import, ids may change, so re-run list_slide_shapes), " +
    "use it with edit_slide_text or format via execute_office_js.",
  parameters: {
    type: "object",
    properties: {
      slide: {
        type: "string",
        description: "1-based slide position or slide id. Required.",
      },
      element_type: {
        type: "string",
        enum: ["text", "shape", "line"],
        description: "text box, geometric shape, or line. Required.",
      },
      content: {
        type: "string",
        description: "[text] The text content of the text box.",
      },
      shape_type: {
        type: "string",
        description: "[shape] Geometric shape type, e.g. 'Rectangle', 'RoundRectangle', 'Ellipse', 'RightArrow', 'Chevron', 'Pentagon'. Default: Rectangle.",
      },
      x: {
        type: "number",
        description: "Left position in points (default: centered).",
      },
      y: {
        type: "number",
        description: "Top position in points (default: centered).",
      },
      width: {
        type: "number",
        description: "Width in points. Default 300 (text/shape) or 200 (line).",
      },
      height: {
        type: "number",
        description: "Height in points. Default 120 (text/shape).",
      },
      z_order: {
        type: "string",
        enum: ["front", "back"],
        description:
          "Stacking position for the new shape: 'front' (default, on top) or 'back' (behind all existing content). " +
          "Full-bleed shapes are automatically sent to the back; use this to force it.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Adding a caption box', 'Inserting an arrow shape'.",
      },
    },
    required: ["slide", "element_type"],
  },
};

/** True when the shape geometry covers (nearly) the whole slide. */
function isFullBleedInsert(options: Record<string, number>): boolean {
  const left = options.left;
  const top = options.top;
  const width = options.width;
  const height = options.height;
  if (left === undefined || top === undefined || width === undefined || height === undefined) {
    return false;
  }
  return (width * height) / (SLIDE_WIDTH * SLIDE_HEIGHT) >= 0.98;
}

toolRegistry.register(insertSlideElement, async (args) => {
  const slideRef = args.slide as string | undefined;
  const elementType = args.element_type as string | undefined;
  if (!slideRef || !elementType) {
    return JSON.stringify({ error: "slide and element_type are required." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);
        const slide = context.presentation.slides.getItem(slideId);
        const shapes = slide.shapes;

        const options = {
          ...(args.x !== undefined ? { left: args.x as number } : {}),
          ...(args.y !== undefined ? { top: args.y as number } : {}),
          ...(args.width !== undefined ? { width: args.width as number } : {}),
          ...(args.height !== undefined ? { height: args.height as number } : {}),
        };

        let newShape: PowerPoint.Shape;
        if (elementType === "text") {
          newShape = shapes.addTextBox((args.content as string) || "", options);
        } else if (elementType === "line") {
          newShape = shapes.addLine("Straight", {
            ...options,
            ...(args.width !== undefined ? { width: args.width as number } : { width: 200 }),
          });
        } else {
          const geomType = (args.shape_type as string) || "Rectangle";
          newShape = shapes.addGeometricShape(geomType as PowerPoint.GeometricShapeType, options);
        }

        const sendToBack =
          (args.z_order as string) === "back" ||
          (elementType === "shape" && isFullBleedInsert(options));

        newShape.load("id");
        const bgName = sendToBack ? `__odb_bg_${Date.now()}` : undefined;
        if (bgName) newShape.name = bgName;
        await context.sync();

        if (!sendToBack) {
          return {
            success: true,
            slide_id: slideId,
            element_id: newShape.id,
            element_type: elementType,
          };
        }

        // Send to back: reorder the shape to the first spTree position via the
        // OOXML write-back path. This re-imports the slide, so ids change.
        const out = await withSlideZip(context, slideId, async ({ zip, markDirty, slidePath }) => {
          const xml = await getSlideXmlFromZip(zip);
          const edited = moveShapeToBack(xml, bgName as string);
          zip.file(slidePath, edited);
          markDirty();
          const parsed = parseSlideShapes(edited);
          const target = parsed.find((s) => s.name === bgName);
          return { order: target ? target.order : 0, shape_count: parsed.length };
        });

        let elementId: string | undefined;
        try {
          const reimported = await exportSlideXmlById(context, out.newSlideId);
          elementId = parseSlideShapes(reimported).find((s) => s.name === bgName)?.id;
        } catch {
          elementId = undefined;
        }

        return {
          success: true,
          slide_id: slideId,
          element_id: elementId,
          element_type: elementType,
          z_order: "back",
          order: (out.result as { order: number }).order,
          warning:
            "Shape placed at the back of the stacking order. The slide was re-imported, so PowerPoint " +
            "reassigned the slide and shape ids. Re-run list_slide_shapes before addressing shapes again.",
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    slide: slideRef,
    element_id: "101",
    element_type: elementType,
    ...(args.z_order === "back" ? { z_order: "back", order: 0 } : {}),
    dev_note: "[Dev mode] insert_slide_element",
  });
});