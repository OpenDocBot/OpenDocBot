import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const verifyDoc: ToolDefinition = {
  name: "verify_doc",
  host: "word",
  description:
    "Fast structural check — returns paragraph style distribution, list numbering sequence, per-table row/cell shape, and which paragraphs start a new page. " +
    "page_break_before_paragraphs lists indices whose pageBreakBefore property is set; page_break_paragraphs lists indices whose text contains a manual page break (\\f). " +
    "No screenshot, no LLM call. Use between edits to spot numbering restarts, table breaks, missing page breaks, or paragraphs that fell off their style.",
  parameters: {
    type: "object",
    properties: {
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Checking document structure', 'Verifying headings and styles'.",
      },
    },
  },
};

interface StyleCount {
  style: string;
  count: number;
}

interface ListItemInfo {
  paragraph_index: number;
  list_string: string;
  level: number;
}

interface TableInfo {
  table_index: number;
  rows: number;
  cells_per_row: number[];
}

toolRegistry.register(verifyDoc, async () => {
  if (isInsideOffice() && typeof Word !== "undefined") {
    try {
      const result = await Word.run(async (context) => {
        const body = context.document.body;
        const paragraphs = body.paragraphs;
        const tables = body.tables;

        paragraphs.load("items/styleBuiltIn, items/style, items/pageBreakBefore, items/text");
        tables.load("items/rows/items/cellCount");
        await context.sync();

        const styleCounts = new Map<string, number>();
        const listItems: ListItemInfo[] = [];
        const pageBreakBeforeParagraphs: number[] = [];
        const pageBreakParagraphs: number[] = [];

        for (let i = 0; i < paragraphs.items.length; i++) {
          const p = paragraphs.items[i];
          const styleKey = p.styleBuiltIn === "Other" || p.styleBuiltIn === null
            ? (p.style || "Normal")
            : p.styleBuiltIn;
          styleCounts.set(styleKey, (styleCounts.get(styleKey) || 0) + 1);

          if ((p as unknown as { pageBreakBefore?: boolean }).pageBreakBefore) {
            pageBreakBeforeParagraphs.push(i);
          }

          if (p.text.includes("\f")) {
            pageBreakParagraphs.push(i);
          }

          try {
            const li = p.listItemOrNullObject;
            if (!li.isNullObject) {
              listItems.push({
                paragraph_index: i,
                list_string: li.listString,
                level: li.level,
              });
            }
          } catch {
            // listItemOrNullObject may throw on certain paragraph types (table cell, header)
          }
        }

        const styleDistribution: StyleCount[] = Array.from(styleCounts.entries())
          .map(([style, count]) => ({ style, count }))
          .sort((a, b) => b.count - a.count);

        const tableShapes: TableInfo[] = tables.items.map((t, idx) => ({
          table_index: idx,
          rows: t.rows.items.length,
          cells_per_row: t.rows.items.map((r) => r.cellCount),
        }));

        return {
          paragraph_count: paragraphs.items.length,
          style_distribution: styleDistribution,
          list_items: listItems,
          table_count: tables.items.length,
          tables: tableShapes,
          page_break_before_paragraphs: pageBreakBeforeParagraphs,
          page_break_paragraphs: pageBreakParagraphs,
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    paragraph_count: 10,
    style_distribution: [
      { style: "Normal", count: 7 },
      { style: "Heading1", count: 1 },
      { style: "Heading2", count: 2 },
    ],
    list_items: [
      { paragraph_index: 3, list_string: "1.", level: 0 },
      { paragraph_index: 4, list_string: "2.", level: 0 },
    ],
    table_count: 1,
    tables: [{ table_index: 0, rows: 3, cells_per_row: [2, 2, 2] }],
    page_break_before_paragraphs: [],
    page_break_paragraphs: [],
  });
});
