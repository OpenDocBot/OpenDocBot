import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { resolveSlideIndex } from "./pptx";

const modifyPresentationStructure: ToolDefinition = {
  name: "modify_presentation_structure",
  host: "powerpoint",
  description:
    "Create, delete, duplicate, or move slides in the presentation. " +
    "operations: create (appends a new slide; optional layout_id / slide_master_id from list_masters), " +
    "delete (removes a slide), duplicate (copies a slide immediately after the original), " +
    "move (moves a slide to a new 1-based position). " +
    "Slides are addressed by 1-based position or slide id. Positions change after structural edits — re-read the structure after.",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["create", "delete", "duplicate", "move"],
        description: "Which operation to perform. Required.",
      },
      slide: {
        type: "string",
        description: "1-based position or slide id. Required for delete, duplicate, move.",
      },
      position: {
        type: "number",
        description: "[move] Target 1-based position.",
      },
      layout_id: {
        type: "string",
        description: "[create] Layout id from list_masters.",
      },
      slide_master_id: {
        type: "string",
        description: "[create] Slide master id from list_masters.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Adding an agenda slide', 'Removing the appendix slide', 'Reordering slides'.",
      },
    },
    required: ["operation"],
  },
};

toolRegistry.register(modifyPresentationStructure, async (args) => {
  const operation = args.operation as string;
  const slideRef = args.slide as string | undefined;
  const position = args.position as number | undefined;

  if (!operation) {
    return JSON.stringify({ error: "operation is required (create, delete, duplicate, move)." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;

        if (operation === "create") {
          slides.add({
            ...(args.layout_id ? { layoutId: args.layout_id as string } : {}),
            ...(args.slide_master_id ? { slideMasterId: args.slide_master_id as string } : {}),
          });
          await context.sync();
          const count = slides.getCount();
          await context.sync();
          return { success: true, operation: "create", new_position: count.value };
        }

        if (!slideRef) {
          throw new Error(`slide is required for operation "${operation}".`);
        }
        const { slideId, total } = await resolveSlideIndex(context, slideRef);

        if (operation === "delete") {
          slides.getItem(slideId).delete();
          await context.sync();
          return { success: true, operation: "delete", slide_id: slideId };
        }

        if (operation === "duplicate") {
          const slide = slides.getItem(slideId);
          const base64 = slide.exportAsBase64();
          await context.sync();
          context.presentation.insertSlidesFromBase64(base64.value, {
            targetSlideId: slideId,
          });
          await context.sync();
          slides.load("items/id");
          await context.sync();
          return { success: true, operation: "duplicate", source_slide_id: slideId };
        }

        if (operation === "move") {
          if (position === undefined || position < 1 || position > total) {
            throw new Error(`position must be a 1-based target between 1 and ${total}.`);
          }
          slides.getItem(slideId).moveTo(position - 1);
          await context.sync();
          return { success: true, operation: "move", slide_id: slideId, new_position: position };
        }

        throw new Error(`Unknown operation: ${operation}`);
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    operation,
    dev_note: "[Dev mode] modify_presentation_structure",
  });
});
