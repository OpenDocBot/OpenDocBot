import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";

const setPageBreak: ToolDefinition = {
  name: "set_page_break",
  host: "word",
  description:
    "Force a section to start on a new page. Address the paragraph that should begin the new page by 0-based " +
    "paragraph index or text (heading_text matches exact text, then a unique substring). " +
    "Tries the pageBreakBefore property first (it survives later text edits); the tool VERIFIES persistence in a " +
    "fresh document load, and if the host drops the property it falls back to an explicit page break, cleans up " +
    "its own artifact paragraphs, and verifies the break landed. " +
    "Returns method ('pageBreakBefore' or 'manual'), the paragraph index (which may shift), and verified. " +
    "When method is 'manual', a warning explains the break is a \\f character. " +
    "Use remove:true to clear the break on that paragraph.",
  parameters: {
    type: "object",
    properties: {
      paragraph: {
        type: "number",
        description: "0-based paragraph index of the paragraph that should start on a new page (prefer this for long body paragraphs).",
      },
      heading_text: {
        type: "string",
        description: "Text of the paragraph that should start on a new page (exact match, then unique substring).",
      },
      remove: {
        type: "boolean",
        description: "Remove the page break on the addressed paragraph instead of adding one.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Starting the ToC on page 2', 'Moving section 3 to a new page'.",
      },
    },
  },
};

/** Resolve the target paragraph index by exact text, then a unique substring. */
function resolveByText(
  paragraphs: { text: string }[],
  text: string
): { index: number; method: "exact" | "substring" } | { error: string } {
  const trimmed = text.trim();
  const exact: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].text.trim() === trimmed) exact.push(i);
  }
  if (exact.length === 1) return { index: exact[0], method: "exact" };
  if (exact.length > 1) {
    return { error: `Ambiguous: ${exact.length} paragraphs match "${trimmed}". Use the paragraph index instead.` };
  }

  // No exact match: unique substring match.
  const substring: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].text.includes(trimmed)) substring.push(i);
  }
  if (substring.length === 1) return { index: substring[0], method: "substring" };
  if (substring.length > 1) {
    return { error: `Ambiguous: "${trimmed}" matches ${substring.length} paragraphs. Use the paragraph index instead.` };
  }

  // Not found: list nearby candidates so the model can pick an index.
  const samples = paragraphs
    .map((p, i) => `${i}: ${p.text.slice(0, 60)}`)
    .slice(0, 30)
    .join("\n");
  return {
    error:
      `No paragraph matches "${trimmed}". Read the document (read_doc_section) and pass the 0-based paragraph index instead. ` +
      `First 30 paragraphs:\n${samples}`,
  };
}

/** Locate a paragraph by exact text, then unique substring. Returns -1 when absent. */
function findIndexByText(paragraphs: { text: string }[], text: string): number {
  const trimmed = text.trim();
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].text.trim() === trimmed) return i;
  }
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].text.includes(trimmed)) return i;
  }
  return -1;
}

toolRegistry.register(setPageBreak, async (args) => {
  const paragraphIndex = args.paragraph as number | undefined;
  const headingText = args.heading_text as string | undefined;
  const remove = args.remove as boolean | undefined;

  if (!isInsideOffice() || typeof Word === "undefined") {
    return JSON.stringify({
      success: true,
      dev_note: "[Dev mode] set_page_break",
    });
  }

  try {
    // Phase 1: locate the target. For remove, act entirely here (single run).
    const phase1 = await Word.run(async (context) => {
      const body = context.document.body;
      const paragraphs = body.paragraphs;
      paragraphs.load("items");
      await context.sync();

      let targetIdx: number;
      if (headingText) {
        for (let i = 0; i < paragraphs.items.length; i++) {
          paragraphs.items[i].load("text");
        }
        await context.sync();
        const resolved = resolveByText(
          paragraphs.items.map((p) => ({ text: p.text })),
          headingText
        );
        if ("error" in resolved) return { error: resolved.error };
        targetIdx = resolved.index;
      } else if (paragraphIndex !== undefined) {
        if (paragraphIndex < 0 || paragraphIndex >= paragraphs.items.length) {
          return {
            error: `paragraph ${paragraphIndex} out of range (0-${paragraphs.items.length - 1}).`,
          };
        }
        targetIdx = paragraphIndex;
      } else {
        return { error: "Provide either paragraph (index) or heading_text." };
      }

      const target = paragraphs.items[targetIdx];
      target.load("text, pageBreakBefore");
      await context.sync();

      if (remove) {
        let method = "none";
        if ((target as unknown as { pageBreakBefore?: boolean }).pageBreakBefore) {
          (target as unknown as { pageBreakBefore: boolean }).pageBreakBefore = false;
          method = "pageBreakBefore";
        }
        // A manual \f break sits 1-2 paragraphs before the target, with an
        // empty artifact between it and the break (insertBreak yields
        // [empty artifact, \f, target]). Remove the break and any artifact.
        const scanFrom = Math.max(0, targetIdx - 2);
        for (let j = scanFrom; j < targetIdx; j++) {
          paragraphs.items[j].load("text");
        }
        await context.sync();

        const toDelete: number[] = [];
        for (let j = scanFrom; j < targetIdx; j++) {
          const t = paragraphs.items[j].text;
          if (t.includes("\f")) {
            method = "manual";
            toDelete.push(j);
            if (j > 0 && paragraphs.items[j - 1].text.trim().length === 0) {
              toDelete.push(j - 1);
            }
            break;
          }
        }
        for (let j = toDelete.length - 1; j >= 0; j--) {
          paragraphs.items[toDelete[j]].delete();
        }
        await context.sync();
        return { success: true, action: "remove", method, verified: true };
      }

      // Add: set the property.
      (target as unknown as { pageBreakBefore: boolean }).pageBreakBefore = true;
      await context.sync();
      return { index: targetIdx, text: target.text };
    });

    if ("error" in phase1) return JSON.stringify(phase1);
    // Remove happened entirely in phase 1.
    if ("action" in phase1) return JSON.stringify(phase1);

    const targetText = (phase1 as { text: string }).text.trim();

    // Phase 2: FRESH load — did pageBreakBefore actually persist?
    const phase2 = await Word.run(async (context) => {
      const body = context.document.body;
      const paragraphs = body.paragraphs;
      paragraphs.load("items");
      await context.sync();
      for (let i = 0; i < paragraphs.items.length; i++) {
        paragraphs.items[i].load("text, pageBreakBefore");
      }
      await context.sync();

      const idx = findIndexByText(paragraphs.items as unknown as { text: string }[], targetText);
      if (idx < 0) {
        return { error: "Could not re-locate the target paragraph." };
      }

      if ((paragraphs.items[idx] as unknown as { pageBreakBefore?: boolean }).pageBreakBefore) {
        return { success: true, action: "add", paragraph: idx, method: "pageBreakBefore", verified: true };
      }

      // Host dropped pageBreakBefore: insert an explicit break before the target.
      paragraphs.items[idx].getRange("Start").insertBreak("Page", "Before");
      await context.sync();
      // Do NOT re-read the collection here — it is stale after the structural
      // edit. Verification happens in a fresh run (phase 3).
      return { text: targetText };
    });

    if ("error" in phase2) return JSON.stringify(phase2);
    if ("action" in phase2) return JSON.stringify(phase2);

    // Phase 3: FRESH load — verify the manual break landed, clean up the empty
    // artifact insertBreak left, and report the current indices.
    const phase3 = await Word.run(async (context) => {
      const body = context.document.body;
      const paragraphs = body.paragraphs;
      paragraphs.load("items");
      await context.sync();
      for (let i = 0; i < paragraphs.items.length; i++) {
        paragraphs.items[i].load("text");
      }
      await context.sync();

      const X = findIndexByText(paragraphs.items as unknown as { text: string }[], targetText);
      if (X < 0) {
        return {
          success: true,
          action: "add",
          method: "manual",
          verified: false,
          warning:
            "A page break was inserted before the target, but the target could not be re-located to confirm it landed. " +
            "Call verify_doc and check page_break_paragraphs.",
        };
      }

      // The \f lands 1-2 paragraphs before the target: insertBreak produces
      // [empty artifact, \f, target] in Word for the web.
      let breakPara = -1;
      for (let j = Math.max(0, X - 2); j < X; j++) {
        if (paragraphs.items[j].text.includes("\f")) {
          breakPara = j;
          break;
        }
      }
      const verified = breakPara >= 0;

      // Delete the single empty artifact insertBreak leaves directly before the
      // \f (insertBreak yields [empty artifact, \f, target]). Only the immediate
      // predecessor is the artifact — a pre-existing blank spacing paragraph
      // further back is left alone. The deletion is before both the break and
      // the target, so both indices shift by 1 — no same-run re-read needed.
      let removed = 0;
      if (verified && breakPara > 0 && paragraphs.items[breakPara - 1].text.trim().length === 0) {
        paragraphs.items[breakPara - 1].delete();
        removed = 1;
        await context.sync();
      }

      return {
        success: true,
        action: "add",
        paragraph: X - removed,
        method: "manual",
        manual_break_paragraph: breakPara >= 0 ? breakPara - removed : undefined,
        verified,
        warning:
          "The host did not persist pageBreakBefore, so an explicit page break (\\f) was used before the target. " +
          "Manual breaks live inside paragraph text — avoid edit_doc_text edits that span the break paragraph.",
      };
    });

    return JSON.stringify(phase3);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
});