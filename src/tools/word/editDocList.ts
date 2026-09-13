import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const LIST_STYLES: Record<string, string> = {
  bullet: "List Bullet",
  number: "List Number",
};

const editDocList: ToolDefinition = {
  name: "edit_doc_list",
  host: "word",
  description:
    "Create a new bullet/number list or insert an item into an existing list. " +
    "Handles list-ID attachment so numbering stays continuous. " +
    "For multi-level (a)(i) or custom numbering schemes, use execute_office_js instead.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create_list", "insert_item"],
        description:
          "create_list: inserts new list after anchor_text. insert_item: adds item to existing list near anchor_item_text.",
      },
      anchor_text: {
        type: "string",
        description: "[create_list] Unique text from the paragraph the list should follow.",
      },
      items: {
        type: "array",
        items: { type: "string" },
        description: "[create_list] Item texts in order. No bullet or number prefixes — Word renders them.",
      },
      list_style: {
        type: "string",
        enum: ["bullet", "number"],
        description: "[create_list] List style.",
      },
      anchor_item_text: {
        type: "string",
        description: "[insert_item] Unique text from an existing list item to insert next to.",
      },
      new_item_text: {
        type: "string",
        description: "[insert_item] New item text. No bullet/number prefix — Word renders it.",
      },
      position: {
        type: "string",
        enum: ["Before", "After"],
        description: "[insert_item] Position relative to the anchor item. Default: After.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Creating bullet list', 'Adding item to list'.",
      },
    },
    required: ["action"],
  },
};

toolRegistry.register(editDocList, async (args) => {
  const action = (args.action as string) || "";
  if (!isInsideOffice() || typeof Word === "undefined") {
    return JSON.stringify({ success: true, dev_note: `[Dev mode] ${action}` });
  }

  try {
    if (action === "create_list") {
      const anchorText = args.anchor_text as string;
      const items = args.items as string[] | undefined;
      const listStyle = (args.list_style as string) || "bullet";

      if (!anchorText) {
        return JSON.stringify({ error: "anchor_text is required for create_list" });
      }
      if (!items || items.length === 0) {
        return JSON.stringify({ error: "items array is required for create_list" });
      }

      return JSON.stringify(
        await Word.run(async (context) => {
          const searchResults = context.document.body.search(anchorText, { matchCase: false });
          searchResults.load("items");
          await context.sync();

          if (searchResults.items.length === 0) {
            return { error: `anchor_text "${anchorText}" not found.` };
          }
          if (searchResults.items.length > 1) {
            return { error: `anchor_text matched ${searchResults.items.length} ranges — must be unique.` };
          }

          const anchorPara = searchResults.items[0].getRange().paragraphs.getFirst();
          anchorPara.load("isListItem, text");
          await context.sync();

          const styleName = LIST_STYLES[listStyle] || "List Bullet";

          let insertAfter: Word.Paragraph = anchorPara;
          for (let i = 0; i < items.length; i++) {
            insertAfter = insertAfter.insertParagraph(items[i], "After");
            insertAfter.styleBuiltIn = styleName as never;

            const li = (insertAfter as unknown as { listItem?: { setLevelBullet?(level: number): void; setLevelNumbering?(level: number): void } }).listItem;
            if (li) {
              if (listStyle === "number") {
                li.setLevelNumbering?.(0);
              } else {
                li.setLevelBullet?.(0);
              }
            }
          }

          await context.sync();
          return { success: true, action: "create_list", itemCount: items.length };
        })
      );
    }

    if (action === "insert_item") {
      const anchorItemText = args.anchor_item_text as string;
      const newItemText = args.new_item_text as string;
      const position = (args.position as string) || "After";

      if (!anchorItemText) {
        return JSON.stringify({ error: "anchor_item_text is required for insert_item" });
      }
      if (!newItemText) {
        return JSON.stringify({ error: "new_item_text is required for insert_item" });
      }

      return JSON.stringify(
        await Word.run(async (context) => {
          const searchResults = context.document.body.search(anchorItemText, { matchCase: false });
          searchResults.load("items");
          await context.sync();

          if (searchResults.items.length === 0) {
            return { error: `anchor_item_text "${anchorItemText}" not found.` };
          }
          if (searchResults.items.length > 1) {
            return { error: `anchor_item_text matched ${searchResults.items.length} ranges — must be unique.` };
          }

          const anchorRange = searchResults.items[0].getRange();
          const anchorPara = anchorRange.paragraphs.getFirst();
          anchorPara.load("isListItem");
          await context.sync();

          if (!anchorPara.isListItem) {
            return {
              error:
                "Anchor paragraph is not a list item. insert_item requires an existing list item as anchor.",
            };
          }

          anchorPara.insertParagraph(newItemText, position as Word.InsertLocation);
          await context.sync();

          return { success: true, action: "insert_item" };
        })
      );
    }

    return JSON.stringify({ error: `Unknown action: ${action}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
});
