import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import {
  withSlideZip,
  getSlideXmlFromZip,
  parseSlideShapes,
  resolveSlideIndex,
} from "./pptx";

const editSlideXml: ToolDefinition = {
  name: "edit_slide_xml",
  host: "powerpoint",
  description:
    "Edit the raw OOXML of a PowerPoint slide — use for advanced formatting, custom XML manipulation, " +
    "tables, or anything not covered by other slide tools. " +
    "Provide code as an async function body receiving { zip, markDirty, slidePath }. " +
    "zip is a JSZip archive of the slide; read/edit the slide via zip.file(slidePath). " +
    "IMPORTANT: the zip ALWAYS contains exactly one slide at slidePath (e.g. 'ppt/slides/slide1.xml'), " +
    "no matter which slide you addressed — NEVER guess position-based names like slide2.xml or slide3.xml; they do not exist. " +
    "Call markDirty() if you modified files, then return a serializable result. " +
    "An escapeXml(text) global is available to escape &, <, >, \", ' for safe embedding in XML text content. " +
    "The edited slide is written back in place. Address the slide by 1-based position or slide id.",
  parameters: {
    type: "object",
    properties: {
      slide: {
        type: "string",
        description: "1-based slide position or slide id. Required.",
      },
      code: {
        type: "string",
        description:
          "Async function body receiving { zip, markDirty, slidePath }. Example: " +
          "`const f = zip.file(slidePath); const xml = await f.async('string'); zip.file(slidePath, xml.replace('old','new')); markDirty(); return { ok: true };`",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Customizing slide layout', 'Applying advanced formatting'.",
      },
    },
    required: ["slide", "code"],
  },
};

toolRegistry.register(editSlideXml, async (args) => {
  const slideRef = args.slide as string | undefined;
  const code = args.code as string | undefined;
  if (!slideRef || !code) {
    return JSON.stringify({ error: "slide and code are required." });
  }

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const { slideId } = await resolveSlideIndex(context, slideRef);

        const out = await withSlideZip(context, slideId, async (ctx) => {
          // Provide the escapeXml global to the user's code, matching the
          // documented tool contract.
          const globals = {
            escapeXml: (text: string) =>
              text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&apos;"),
          };
          const wrapped = `return (async () => {\nconst { zip, markDirty, slidePath } = ctx;\nconst escapeXml = globals.escapeXml;\ntry {\n${code}\n} catch (e) { return { __caught: true, error: e.message || String(e) }; }\n})();`;
          const fn = new Function("ctx", "globals", wrapped);
          const out = await fn(ctx, globals);

          if (out && typeof out === "object" && (out as { __caught?: boolean }).__caught) {
            const errMsg = (out as { error?: string }).error || "edit_slide_xml code failed";
            // Wrong-path errors (null.zip.file(...)) are the most common model
            // mistake. Tell it exactly which slide part exists so it recovers.
            const slideFiles = Object.keys(ctx.zip.files)
              .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
              .sort();
            const fileHint = slideFiles.length
              ? ` The zip contains: ${slideFiles.join(", ")}. Always use slidePath (${ctx.slidePath}) — never guess position-based names like slide2.xml.`
              : "";
            throw new Error(`${errMsg}.${fileHint}`);
          }
          return out;
        });

        // Verify the write-back actually persisted: re-export the re-imported
        // slide and compare its shape count against the edited XML. PowerPoint
        // silently drops malformed shapes on re-import, so surface that.
        let verification: { ok: boolean; message: string } | undefined;
        if (out.dirty && out.newSlideId && out.editedXml) {
          try {
            const editedShapes = parseSlideShapes(out.editedXml).length;
            const reimportedXml = await reExportSlideXml(context, out.newSlideId);
            const reimportedShapes = parseSlideShapes(reimportedXml).length;
            verification =
              reimportedShapes >= editedShapes
                ? { ok: true, message: `${reimportedShapes} shapes present after re-import.` }
                : {
                    ok: false,
                    message:
                      `PowerPoint dropped ${editedShapes - reimportedShapes} shape(s) during re-import ` +
                      `(edited XML had ${editedShapes}, re-imported slide has ${reimportedShapes}). ` +
                      `This usually means the injected XML was malformed. Prefer insert_slide_element for shapes.`,
                  };
          } catch (e) {
            verification = {
              ok: false,
              message: `Could not verify re-imported slide: ${(e as Error).message}`,
            };
          }
        }

        return {
          success: true,
          result: out.result,
          newSlideId: out.newSlideId,
          reimported: out.dirty,
          ...(out.warning ? { warning: out.warning } : {}),
          ...(verification ? { verification } : {}),
        };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    success: true,
    slide: slideRef,
    dev_note: "[Dev mode] edit_slide_xml",
  });
});

/** Re-export a slide (by id) and return its slide1.xml string. */
async function reExportSlideXml(
  context: PowerPoint.RequestContext,
  slideId: string
): Promise<string> {
  const slide = context.presentation.slides.getItem(slideId);
  const base64Result = slide.exportAsBase64();
  await context.sync();
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(base64Result.value, { base64: true });
  return getSlideXmlFromZip(zip);
}
