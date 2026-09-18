import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice, getHost } from "../../office";
import { getSuggestion, removeSuggestion } from "../../chat/suggestionRegistry";

/**
 * Remove a review comment that the assistant itself added earlier in this
 * conversation. Provenance is enforced by the session registry: an id must have
 * been recorded by `add_suggestion` or the call is rejected. Available in Word
 * and Excel only (hidden in PowerPoint by mode logic).
 */
const removeSuggestionTool: ToolDefinition = {
  name: "remove_suggestion",
  host: "both",
  suggestionOnly: true,
  description:
    "Remove a review comment that YOU added earlier in this conversation, using the `id` returned by " +
    "add_suggestion. You cannot remove comments added by the user or other people. " +
    "Available in Word and Excel only.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The id returned by add_suggestion for the suggestion to remove.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Removing an outdated suggestion'.",
      },
    },
    required: ["id"],
  },
};

/** Runtime capability check; never throws when the requirements API is absent. */
function supports(apiSet: string, minVersion: string): boolean {
  try {
    if (typeof Office === "undefined") return false;
    return Office.context.requirements.isSetSupported(apiSet, minVersion);
  } catch {
    return false;
  }
}

toolRegistry.register(removeSuggestionTool, async (args) => {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    return JSON.stringify({ error: "id is required." });
  }

  const ref = getSuggestion(id);
  if (!ref) {
    return JSON.stringify({
      error:
        "Only suggestions the assistant added in this conversation can be removed (unknown id).",
    });
  }

  if (isInsideOffice()) {
    const host = getHost();

    if (host === "word") {
      if (typeof Word === "undefined") {
        return JSON.stringify({ error: "Word API is not available." });
      }
      if (!supports("WordApi", "1.4")) {
        return JSON.stringify({
          error:
            "Comment support requires WordApi 1.4 or later. Update Word to a current Microsoft 365 build.",
        });
      }
      try {
        const result = await Word.run(async (context) => {
          const comments = context.document.body.getComments();
          comments.load();
          await context.sync();

          const comment = comments.items.find((c) => c.id === id);
          if (!comment) {
            removeSuggestion(id);
            return { error: "That suggestion no longer exists (it may have been deleted already)." };
          }
          comment.delete();
          await context.sync();
          removeSuggestion(id);
          return { ok: true, id };
        });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    if (host === "excel") {
      if (typeof Excel === "undefined") {
        return JSON.stringify({ error: "Excel API is not available." });
      }
      const sheetName = ref.sheet;
      if (!sheetName) {
        return JSON.stringify({ error: "This suggestion has no worksheet recorded." });
      }
      if (!supports("ExcelApi", "1.10")) {
        return JSON.stringify({
          error:
            "Comment support requires ExcelApi 1.10 or later. Update Excel to a current Microsoft 365 build.",
        });
      }
      try {
        const result = await Excel.run(async (context) => {
          const sheet = context.workbook.worksheets.getItemOrNullObject(sheetName);
          sheet.load("isNullObject");
          await context.sync();
          if (sheet.isNullObject) {
            return { error: `Worksheet "${sheetName}" not found.` };
          }
          const comment = sheet.comments.getItem(id);
          comment.delete();
          await context.sync();
          removeSuggestion(id);
          return { ok: true, id };
        });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    return JSON.stringify({
      error: "remove_suggestion is only available in Word and Excel.",
    });
  }

  removeSuggestion(id);
  return JSON.stringify({ success: true, dev_note: "[Dev mode] remove_suggestion" });
});
