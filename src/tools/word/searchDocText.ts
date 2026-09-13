import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const searchDocText: ToolDefinition = {
  name: "search_doc_text",
  host: "word",
  description:
    "Find a literal phrase in the document body. Returns paragraph_index + snippet for each match. " +
    "Use when you need to find text but don't know which heading or paragraph range it's in. " +
    "Chain the returned paragraph_index into read_doc_section for the full context.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Literal text to find (case-sensitive). Not a regex.",
      },
      max_results: {
        type: "number",
        description: "How many matches to return (default 10, max 50). total_matches reports the full count.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Searching for section text', 'Finding heading references'.",
      },
    },
    required: ["query"],
  },
};

toolRegistry.register(searchDocText, async (args) => {
  const query = (args.query as string) || "";
  const maxResults = Math.min((args.max_results as number) || 10, 50);

  if (!query) {
    return JSON.stringify({ error: "query is required" });
  }

  if (isInsideOffice() && typeof Word !== "undefined") {
    try {
      return await Word.run(async (context) => {
        const body = context.document.body;
        const searchResults = body.search(query, { matchCase: true });
        searchResults.load("items");
        await context.sync();

        const allParas = body.paragraphs;
        allParas.load("items");
        for (let i = 0; i < allParas.items.length; i++) {
          allParas.items[i].load("text");
        }
        await context.sync();

        const totalMatches = searchResults.items.length;
        const matches: { paragraph_index: number; snippet: string }[] = [];

        for (let i = 0; i < Math.min(totalMatches, maxResults); i++) {
          const sr = searchResults.items[i];
          const srRange = sr.getRange();
          const srPara = srRange.paragraphs.getFirst();
          srPara.load("text");
          await context.sync();

          // Find which paragraph this is
          let paraIdx = -1;
          for (let j = 0; j < allParas.items.length; j++) {
            if (allParas.items[j].text === srPara.text) {
              paraIdx = j;
              break;
            }
          }
          if (paraIdx < 0) {
            // Fallback: find by text inclusion
            for (let j = 0; j < allParas.items.length; j++) {
              if (allParas.items[j].text.includes(query)) {
                paraIdx = j;
                break;
              }
            }
          }

          const snippet =
            srPara.text.length > 150
              ? srPara.text.slice(0, 150) + "…"
              : srPara.text;

          matches.push({ paragraph_index: paraIdx, snippet });
        }

        return { matches, total_matches: totalMatches };
      }).then(JSON.stringify).then(JSON.parse);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    matches: [{ paragraph_index: 0, snippet: "[Dev mode] Sample match text." }],
    total_matches: 1,
  });
});
