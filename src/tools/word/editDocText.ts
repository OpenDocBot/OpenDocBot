import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const editDocText: ToolDefinition = {
  name: "edit_doc_text",
  host: "word",
  description:
    "Surgical text replacement. Finds old_text in the document and replaces ONLY that range with new_text. " +
    "For multi-paragraph spans, join paragraphs with \\n. old_text must appear exactly once — include enough " +
    "surrounding words for uniqueness, but keep the span to the words that change. " +
    "Empty new_text deletes the matched range. Use for text edits at word/sentence level.",
  parameters: {
    type: "object",
    properties: {
      old_text: {
        type: "string",
        description:
          "Exact text to replace. Must appear exactly once. " +
          "Include surrounding words for uniqueness if ambiguous. " +
          "For multi-paragraph, join with \\n. Curly/straight quotes auto-normalized.",
      },
      new_text: {
        type: "string",
        description:
          "Replacement text. Empty string deletes. Use \\n for paragraph breaks. " +
          "If old_text includes context words, repeat them verbatim — only the words that differ should change.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description of what this action does. E.g. 'Updating section text', 'Correcting typo'. Shown to the user instead of the tool name.",
      },
    },
    required: ["old_text", "new_text"],
  },
};

toolRegistry.register(editDocText, async (args) => {
  const oldText = (args.old_text as string) || "";
  const newText = (args.new_text as string) || "";

  if (!oldText) {
    return JSON.stringify({ error: "old_text is required" });
  }

  const oldParas = oldText.split(/\\n/);
  if (oldParas[0].length === 0) {
    return JSON.stringify({
      error:
        "old_text starts with a blank line. The first line is the search anchor — start at the first sentence.",
    });
  }

  if (isInsideOffice() && typeof Word !== "undefined") {
    try {
      const result = await Word.run(async (context) => {
        const body = context.document.body;

        // Single paragraph: direct search
        if (oldParas.length === 1) {
          let searchResults = body.search(oldParas[0], { matchCase: true });
          searchResults.load("items");
          await context.sync();

          if (searchResults.items.length === 0) {
            searchResults = body.search(oldParas[0], { matchCase: false });
            searchResults.load("items");
            await context.sync();
            if (searchResults.items.length === 0) {
              return {
                error:
                  "old_text not found. Check exact spelling and whitespace, or re-read with read_doc_section.",
              };
            }
          }

          if (searchResults.items.length > 1) {
            return {
              error: `old_text matched ${searchResults.items.length} ranges — must be unique. Add surrounding words.`,
            };
          }

          const unescaped = newText.replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
          searchResults.items[0].insertText(unescaped, "Replace");
          await context.sync();
          return { success: true, replaced: true };
        }

        // Multi-paragraph: find first para, verify subsequent, expand range
        let firstSearch = body.search(oldParas[0], { matchCase: true });
        firstSearch.load("items");
        await context.sync();

        if (firstSearch.items.length === 0) {
          firstSearch = body.search(oldParas[0], { matchCase: false });
          firstSearch.load("items");
          await context.sync();
          if (firstSearch.items.length === 0) {
            return {
              error: `First paragraph not found: "${oldParas[0].slice(0, 80)}..."`,
            };
          }
        }

        if (firstSearch.items.length > 1) {
          return {
            error: `First paragraph matched ${firstSearch.items.length} ranges — provide more unique anchor text.`,
          };
        }

        const allParas = body.paragraphs;
        allParas.load("items");
        await context.sync();

        // Load all paragraph texts to find the matching index
        for (let i = 0; i < allParas.items.length; i++) {
          allParas.items[i].load("text");
        }
        await context.sync();

        const normalizedFirst = oldParas[0].trim().toLowerCase();
        let startIdx = -1;
        for (let i = 0; i < allParas.items.length; i++) {
          if (allParas.items[i].text.trim().toLowerCase().includes(normalizedFirst)) {
            startIdx = i;
            break;
          }
        }

        if (startIdx < 0) {
          return { error: "Could not locate paragraph index for first match." };
        }

        // Verify subsequent paragraphs
        for (let j = 1; j < oldParas.length; j++) {
          if (startIdx + j >= allParas.items.length) {
            return {
              error: `old_text spans ${oldParas.length} paragraphs but only ${allParas.items.length - startIdx} remain.`,
            };
          }
          const actual = allParas.items[startIdx + j].text.trim();
          const expected = oldParas[j].trim();
          if (actual !== expected) {
            return {
              error: `Paragraph ${j + 1} doesn't match. Expected "${expected.slice(0, 60)}", got "${actual.slice(0, 60)}". Re-read with read_doc_section.`,
            };
          }
        }

        // Build range spanning the matched paragraphs
        const rStart = allParas.items[startIdx].getRange();
        const rEnd = allParas.items[startIdx + oldParas.length - 1].getRange();
        const fullRange = rStart.expandTo(rEnd);

        const unescaped = newText.replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
        fullRange.insertText(unescaped, "Replace");
        await context.sync();

        return { success: true, replaced: true };
      });

      if (typeof result === "object" && "error" in result && result.error) {
        return JSON.stringify(result);
      }
      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({ success: true, dev_note: "[Dev mode] Text replaced" });
});
