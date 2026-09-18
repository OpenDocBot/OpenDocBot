import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice, getHost } from "../../office";
import { parseRangeAddress, resolveWorksheet } from "../excel/shared";
import { registerSuggestion } from "../../chat/suggestionRegistry";

/**
 * Insert a native review comment (a suggestion) without modifying content.
 * Word anchors on an exact, unique `target_text`; Excel attaches to a single
 * `cell`. Available in Word and Excel only (hidden in PowerPoint by mode logic).
 */
const addSuggestion: ToolDefinition = {
  name: "add_suggestion",
  host: "both",
  suggestionOnly: true,
  description:
    "Add a review comment (a suggestion) to the document without changing its content. " +
    "In Word, provide `target_text`: the exact passage to anchor the comment to; it must match " +
    "exactly one place in the document. In Excel, provide `cell`: a single-cell A1 address. " +
    "Available in Word and Excel only.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The comment text. Be specific and actionable.",
      },
      target_text: {
        type: "string",
        description:
          "Word only. The exact passage to anchor the comment to. Must match exactly one place in the document.",
      },
      cell: {
        type: "string",
        description: "Excel only. A single-cell A1 address, e.g. 'B4'.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Suggest rephrasing the intro'.",
      },
    },
    required: ["text"],
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

function snippet(value: string): string {
  return value.length > 80 ? `${value.slice(0, 80)}...` : value;
}

toolRegistry.register(addSuggestion, async (args) => {
  const text = typeof args.text === "string" ? args.text.trim() : "";
  if (!text) {
    return JSON.stringify({ error: "text is required." });
  }

  if (isInsideOffice()) {
    const host = getHost();

    if (host === "word") {
      if (typeof Word === "undefined") {
        return JSON.stringify({ error: "Word API is not available." });
      }
      const target = typeof args.target_text === "string" ? args.target_text : "";
      if (!target.trim()) {
        return JSON.stringify({
          error:
            "target_text is required in Word: pass the exact passage the comment should anchor to.",
        });
      }
      if (!supports("WordApi", "1.4")) {
        return JSON.stringify({
          error:
            "Comment support requires WordApi 1.4 or later. Update Word to a current Microsoft 365 build.",
        });
      }
      try {
        const result = await Word.run(async (context) => {
          const body = context.document.body;
          const search = body.search(target, { matchCase: true });
          search.load("items");
          await context.sync();

          if (search.items.length === 0) {
            return {
              error: `target_text not found: "${snippet(target)}". Use an exact passage from the document.`,
            };
          }
          if (search.items.length > 1) {
            return {
              error: `target_text matched ${search.items.length} passages — must be unique. Add surrounding words.`,
            };
          }

          const comment = search.items[0].insertComment(text);
          comment.load("id");
          await context.sync();
          registerSuggestion(comment.id, {
            host: "word",
            anchor: target,
            text,
            createdAt: Date.now(),
          });
          return { ok: true, id: comment.id, anchor: target };
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
      const cell = typeof args.cell === "string" ? args.cell.trim() : "";
      if (!cell) {
        return JSON.stringify({
          error: 'cell is required in Excel: pass a single-cell A1 address, e.g. "B4".',
        });
      }
      const parsed = parseRangeAddress(cell);
      if (!/^[A-Za-z]+\d+$/.test(parsed.address)) {
        return JSON.stringify({
          error: `cell must be a single-cell address (got "${cell}").`,
        });
      }
      if (!supports("ExcelApi", "1.10")) {
        return JSON.stringify({
          error:
            "Comment support requires ExcelApi 1.10 or later. Update Excel to a current Microsoft 365 build.",
        });
      }
      try {
        const result = await Excel.run(async (context) => {
          const { worksheet, warning } = await resolveWorksheet(context, parsed.sheetName);
          const range = worksheet.getRange(parsed.address);
          const comment = worksheet.comments.add(range, text);
          worksheet.load("name");
          comment.load("id");
          await context.sync();
          registerSuggestion(comment.id, {
            host: "excel",
            sheet: worksheet.name,
            cell: parsed.address,
            text,
            createdAt: Date.now(),
          });
          return {
            ok: true,
            id: comment.id,
            cell: `${worksheet.name}!${parsed.address}`,
            ...(warning ? { warning } : {}),
          };
        });
        return JSON.stringify(result);
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    return JSON.stringify({
      error: "add_suggestion is only available in Word and Excel.",
    });
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] add_suggestion" });
});
