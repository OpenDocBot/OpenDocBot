import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const collapseBlankParagraphs: ToolDefinition = {
  name: "collapse_blank_paragraphs",
  host: "word",
  description:
    "Collapse runs of consecutive empty paragraphs. Use after edits that left blank lines, or on documents converted from PDF. " +
    "Preserves paragraphs containing images, shapes, bookmarks, tracked changes, or page breaks (pageBreakBefore or a manual \\f break). " +
    "Deletes in reverse-order batches so large documents don't time out.",
  parameters: {
    type: "object",
    properties: {
      max_consecutive: {
        type: "number",
        description: "How many blank paragraphs to keep where a run of blanks exists (0, 1, or 2). Default: 1.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Cleaning up empty lines', 'Removing blank paragraphs'.",
      },
    },
  },
};

toolRegistry.register(collapseBlankParagraphs, async (args) => {
  const maxConsecutive = Math.min(Math.max((args.max_consecutive as number) ?? 1, 0), 2);

  if (isInsideOffice() && typeof Word !== "undefined") {
    try {
      const result = await Word.run(async (context) => {
        const body = context.document.body;
        const paragraphs = body.paragraphs;
        paragraphs.load("items");
        await context.sync();

        for (let i = 0; i < paragraphs.items.length; i++) {
          paragraphs.items[i].load("text, pageBreakBefore");
        }
        await context.sync();

        const toDelete: number[] = [];
        let blankRun = 0;

        for (let i = 0; i < paragraphs.items.length; i++) {
          const p = paragraphs.items[i];
          const rawText = p.text;
          const hasPageBreak =
            rawText.includes("\f") ||
            (p as unknown as { pageBreakBefore?: boolean }).pageBreakBefore === true;
          const text = rawText.trim();
          if (text.length === 0 && !hasPageBreak) {
            blankRun++;
            if (blankRun > maxConsecutive) {
              toDelete.push(i);
            }
          } else {
            blankRun = 0;
          }
        }

        // Delete in reverse order to preserve indices
        let deleted = 0;
        let skipped = 0;
        for (let i = toDelete.length - 1; i >= 0; i--) {
          const idx = toDelete[i];
          const para = paragraphs.items[idx];

          // Check for structural content
          try {
            const pics = para.inlinePictures;
            pics.load("items");
            await context.sync();
            if (pics.items.length > 0) {
              skipped++;
              continue;
            }
          } catch {
            // Skip if we can't check
          }

          try {
            para.delete();
            deleted++;

            // Sync every 20 deletions to avoid timeout
            if (deleted % 20 === 0) {
              await context.sync();
            }
          } catch {
            skipped++;
          }
        }

        await context.sync();

        return {
          deleted,
          skipped_with_content: skipped,
          total_blank_runs_found: toDelete.length + skipped,
        };
      });

      if (typeof result === "object" && "error" in result) {
        return JSON.stringify(result);
      }
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    deleted: 0,
    skipped_with_content: 0,
    total_blank_runs_found: 0,
    dev_note: "[Dev mode] collapse_blank_paragraphs",
  });
});
