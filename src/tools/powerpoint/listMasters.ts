import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const listMasters: ToolDefinition = {
  name: "list_masters",
  host: "powerpoint",
  description:
    "List slide masters and their layouts (with master_id and layout_id). " +
    "Use these IDs to add slides with a specific layout via execute_office_js " +
    "(context.presentation.slides.add({ slideMasterId, layoutId })).",
  parameters: {
    type: "object",
    properties: {
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Listing slide masters and layouts'.",
      },
    },
  },
};

toolRegistry.register(listMasters, async () => {
  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const masters = context.presentation.slideMasters;
        masters.load("items/id, items/name");
        await context.sync();

        const list: {
          master_id: string;
          name: string;
          layouts: { layout_id: string; name: string }[];
        }[] = [];

        for (let i = 0; i < masters.items.length; i++) {
          const master = masters.items[i];
          const layouts = master.layouts;
          layouts.load("items/id, items/name");
          await context.sync();

          list.push({
            master_id: master.id,
            name: master.name || "",
            layouts: layouts.items.map((l) => ({ layout_id: l.id, name: l.name || "" })),
          });
        }

        return { masters: list };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    masters: [
      {
        master_id: "M1",
        name: "Office Theme",
        layouts: [
          { layout_id: "L1", name: "Title Slide" },
          { layout_id: "L2", name: "Title and Content" },
        ],
      },
    ],
    dev_note: "[Dev mode] list_masters",
  });
});
