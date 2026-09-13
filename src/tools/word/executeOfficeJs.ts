import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice, getHost } from "../../office";
import { debugLog } from "../../lib/debugLog";

const executeOfficeJs: ToolDefinition = {
  name: "execute_office_js",
  host: "both",
  description:
    "Run custom Office.js JavaScript for operations not covered by other tools. " +
    "In Word the code runs inside Word.run(async (context) => { ... }) and uses Word.js APIs. " +
    "In Excel it runs inside Excel.run(async (context) => { ... }) and uses Excel.js APIs. " +
    "In PowerPoint it runs inside PowerPoint.run(async (context) => { ... }) and uses PowerPoint.js APIs. " +
    "Use context.document.body (Word), context.workbook (Excel), or context.presentation (PowerPoint), " +
    "getSelection()/getSelectedRange()/getActiveSlideOrNullObject(), etc. " +
    "Must call await context.sync(). Return value is passed back as result. Use this for all formatting and structural operations.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript code to execute inside the host's run context (Word.run, Excel.run, or PowerPoint.run). " +
          "Use the host's Office.js API and call await context.sync() after modifications. " +
          "Return a value to include in the result. " +
          "IMPORTANT when READING properties: Office.js proxy objects only expose properties that were explicitly loaded. " +
          "Before reading shape/slide properties, call .load() on the collection or object, then await context.sync(), then access the property. " +
          "PowerPoint read example: const shapes = slide.shapes; shapes.load(\"name,top,left,width,height\"); await context.sync(); const items = shapes.items; for (const s of items) s.top;\n" +
          "Word examples: body.insertParagraph('Hello', 'End'); body.search('text', {matchCase:false}); paragraphs.items[i].styleBuiltIn = 'Heading1'.\n" +
          "Excel examples: worksheet.getRange('A1:C3'); range.values = [[1,2,3]]; range.format.font.bold = true; worksheet.getUsedRange().sort.apply(...).\n" +
          "PowerPoint examples: context.presentation.slides.add(); slide.shapes.addTextBox('text'); shape.textFrame.textRange.text = 'x'; slide.shapes.getItem(id).delete().",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description of what this action does. E.g. 'Changing heading colors to green', 'Inserting a chart'. Shown to the user instead of 'execute_office_js'.",
      },
    },
    required: ["code"],
  },
};

/** Wrap user code so thrown errors are caught and returned as `{ __caught }`. */
function wrapCode(code: string): string {
  return `return (async () => {\ntry {\n${code}\n} catch (e) { const dbg = (e.debugInfo && e.debugInfo.errors && e.debugInfo.errors[0] && e.debugInfo.errors[0].message) || (e.debugInfo && e.debugInfo.code); return { __caught: true, error: e.message || String(e), line: e.lineNumber, debug: dbg || undefined }; }\n})();`;
}

/** Build the tool result. If the user's code threw (caught marker), return an error. */
function buildResult(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    (result as { __caught?: boolean }).__caught
  ) {
    const caught = result as { error?: string; debug?: string };
    const msg = caught.error || "script threw an error";
    const debug = caught.debug ? ` Office debugInfo: ${caught.debug}` : "";
    const notLoaded = /is not available|no está disponible|no está disponible/i.test(msg);
    const hint = notLoaded
      ? " The property was read before it was loaded. Office.js proxies only expose loaded properties: call .load(\"prop\") on the object or collection, then await context.sync(), then read the value. Example: const shapes = slide.shapes; shapes.load(\"top,left,width,height,name\"); await context.sync(); const items = shapes.items; REMEMBER: .load() only queues the fetch, so you MUST await context.sync() BEFORE reading the property. For collections, load the property on the collection itself (e.g. paras.load(\"text\")) then await context.sync() and read paras.items[i].text."
      : "";
    return JSON.stringify({
      error: `Execution error: ${msg}${debug}${hint} WARNING: Office.js is NOT transactional. Operations that ran before the error persist. Read the current state BEFORE retrying — do not blindly re-run the same code.`,
    });
  }
  return JSON.stringify({ success: true, result });
}

toolRegistry.register(executeOfficeJs, async (args) => {
  const code = args.code as string;
  if (!code || code.trim().length === 0) {
    return JSON.stringify({ error: "code parameter is required" });
  }

  if (!isInsideOffice()) {
    return JSON.stringify({ success: true, dev_note: "[Dev mode] Would execute office.js code" });
  }

  const host = getHost();

  try {
    if (host === "excel") {
      if (typeof Excel === "undefined") {
        return JSON.stringify({ error: "Excel.js not available in this host." });
      }
      debugLog("tool", `execute_office_js: Excel.run start (${code.length} chars)`);
      const result = await Excel.run(async (context) => {
        const fn = new Function("context", wrapCode(code));
        return await fn(context);
      });
      return buildResult(result);
    }

    if (host === "powerpoint") {
      if (typeof PowerPoint === "undefined") {
        return JSON.stringify({ error: "PowerPoint.js not available in this host." });
      }
      debugLog("tool", `execute_office_js: PowerPoint.run start (${code.length} chars)`);
      const result = await PowerPoint.run(async (context) => {
        const fn = new Function("context", wrapCode(code));
        return await fn(context);
      });
      return buildResult(result);
    }

    if (typeof Word === "undefined") {
      return JSON.stringify({ error: "Word.js not available in this host." });
    }
    debugLog("tool", `execute_office_js: Word.run start (${code.length} chars)`);
    const result = await Word.run(async (context) => {
      const fn = new Function("context", wrapCode(code));
      return await fn(context);
    });
    return buildResult(result);
  } catch (err) {
    const msg = (err as Error).message || String(err);

    if (msg.includes("SyntaxError") || msg.includes("Unexpected token")) {
      return JSON.stringify({
        error: `Syntax error: ${msg}. Fix the syntax and retry. WARNING: Office.js is NOT transactional — any insertions that ran before the error persist. Call the appropriate read tool to check state before retrying.`,
      });
    }

    if (msg.includes("context.sync") && msg.includes("rejected")) {
      return JSON.stringify({
        error: `Office.js sync error: ${msg}. WARNING: partial content may remain. Call the read tool to inspect.`,
      });
    }

    return JSON.stringify({
      error: `Execution error: ${msg}. WARNING: Office.js is not transactional. Operations that ran before the error persist. Read the current state BEFORE retrying — do not blindly re-run the same code.`,
    });
  }
});
