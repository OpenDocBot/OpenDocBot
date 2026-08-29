import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const FULL_DOC_LIMIT = 80;

const readDocSection: ToolDefinition = {
  name: "read_doc_section",
  host: "word",
  description:
    "Read document text. Call with no arguments to read the full document (up to first 80 paragraphs). " +
    "Use heading to read a specific section by heading name. " +
    "Use paragraph_start/paragraph_end for precise range. " +
    "Each paragraph reports page_break_before when it starts a new page via the pageBreakBefore property, and " +
    "contains_page_break when its text holds a manual page break (\\f). " +
    "Call this after edits to verify what was written, including that page breaks are still in place.",
  parameters: {
    type: "object",
    properties: {
      heading: {
        type: "string",
        description:
          "Exact heading text. Reads from this heading through the next heading of same or higher level.",
      },
      paragraph_start: {
        type: "number",
        description: "0-based paragraph index to start from (defaults to 0 if neither heading nor start given).",
      },
      paragraph_end: {
        type: "number",
        description: "0-based exclusive end index. Defaults to end of document.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Reading Introduction section', 'Checking document content'.",
      },
    },
  },
};

function getHeadingLevel(p: Word.Paragraph): number {
  return p.outlineLevel || 0;
}

toolRegistry.register(readDocSection, async (args) => {
  const heading = args.heading as string | undefined;
  const paraStart = args.paragraph_start as number | undefined;
  const paraEnd = args.paragraph_end as number | undefined;

  // If heading and paragraph_start both given, prefer heading
  const useFullDoc = !heading && paraStart === undefined;

  if (isInsideOffice() && typeof Word !== "undefined") {
    try {
      const result = await Word.run(async (context) => {
        const body = context.document.body;
        const allParas = body.paragraphs;
        allParas.load("items");
        await context.sync();

        const totalCount = allParas.items.length;

        if (totalCount === 0) {
          return { paragraphs: [], start_index: 0, end_index: 0, total_paragraphs: 0 };
        }

        // Determine range
        let startIdx: number;
        let endIdx: number;

        if (useFullDoc) {
          startIdx = 0;
          endIdx = Math.min(totalCount, FULL_DOC_LIMIT);
        } else if (heading) {
          for (let i = 0; i < allParas.items.length; i++) {
            allParas.items[i].load("text, outlineLevel");
          }
          await context.sync();

          const trimmed = heading.trim();
          let foundIdx = -1;
          let foundLevel = 0;

          for (let i = 0; i < allParas.items.length; i++) {
            const p = allParas.items[i];
            const level = getHeadingLevel(p);
            if (level >= 1 && level <= 6 && p.text.trim() === trimmed) {
              foundIdx = i;
              foundLevel = level;
              break;
            }
          }

          if (foundIdx < 0) {
            const lower = trimmed.toLowerCase();
            for (let i = 0; i < allParas.items.length; i++) {
              const p = allParas.items[i];
              const level = getHeadingLevel(p);
              if (level >= 1 && level <= 6 && p.text.trim().toLowerCase() === lower) {
                foundIdx = i;
                foundLevel = level;
                break;
              }
            }
          }

          if (foundIdx < 0) {
            return {
              error: `Heading "${trimmed}" not found. Check doc_state outline for exact text.`,
            };
          }

          startIdx = foundIdx;
          endIdx = allParas.items.length;

          for (let i = startIdx + 1; i < allParas.items.length; i++) {
            const level = getHeadingLevel(allParas.items[i]);
            if (level >= 1 && level <= 6 && level <= foundLevel) {
              endIdx = i;
              break;
            }
          }
        } else {
          startIdx = paraStart ?? 0;
          if (startIdx < 0 || startIdx >= totalCount) {
            return {
              error: `paragraph_start ${startIdx} out of range (0-${totalCount - 1}).`,
            };
          }
          endIdx = paraEnd ?? totalCount;
          if (endIdx <= startIdx) {
            return { error: "paragraph_end must be greater than paragraph_start." };
          }
          if (endIdx > totalCount) endIdx = totalCount;
        }

        // Load text for the range
        for (let i = startIdx; i < Math.min(endIdx, totalCount); i++) {
          allParas.items[i].load("text, styleBuiltIn, outlineLevel, pageBreakBefore");
        }
        await context.sync();

        const paragraphs: { index: number; text: string; style?: string; page_break_before?: boolean; contains_page_break?: boolean }[] = [];
        const effectiveEnd = Math.min(endIdx, totalCount);

        for (let i = startIdx; i < effectiveEnd; i++) {
          const p = allParas.items[i];
          const entry: (typeof paragraphs)[0] = {
            index: i,
            text: p.text,
          };
          if (p.styleBuiltIn && p.styleBuiltIn !== "Other" && p.styleBuiltIn !== "Normal") {
            entry.style = p.styleBuiltIn;
          }
          if ((p as unknown as { pageBreakBefore?: boolean }).pageBreakBefore) {
            entry.page_break_before = true;
          }
          if (p.text.includes("\f")) {
            entry.contains_page_break = true;
          }
          paragraphs.push(entry);
        }

        return {
          paragraphs,
          start_index: startIdx,
          end_index: effectiveEnd,
          total_paragraphs: totalCount,
          truncated: effectiveEnd < endIdx || totalCount > FULL_DOC_LIMIT,
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    paragraphs: [
      { index: 0, text: "[Dev mode] Sample paragraph text." },
      { index: 1, text: "Another sample paragraph." },
    ],
    start_index: 0,
    end_index: 2,
    total_paragraphs: 10,
  });
});
