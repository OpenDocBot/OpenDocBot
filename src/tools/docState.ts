import { isInsideOffice, getHost } from "../office";

export interface DocParagraph {
  text: string;
  styleBuiltIn?: string;
  outlineLevel: number;
  isListItem: boolean;
  listString?: string;
  hasInlinePicture: boolean;
  hasPageBreak: boolean;
  hasPageBreakBefore: boolean;
  index: number;
}

export interface SelectionInfo {
  text: string;
  paragraphStyle?: string;
  isInTable: boolean;
}

export function buildParagraphMarker(p: DocParagraph, style?: string): string {
  const markers: string[] = [];

  const s = style || p.styleBuiltIn;
  if (s && s !== "Normal" && s !== "Other") {
    markers.push(`[${s}]`);
  }
  if (p.listString) {
    markers.push(`[${p.listString}]`);
  }
  if (p.hasPageBreak) {
    markers.push("[page-break]");
  }
  if (p.hasPageBreakBefore) {
    markers.push("[page-break-before]");
  }
  if (p.hasInlinePicture) {
    markers.push("[img]");
  }

  return markers.length > 0 ? markers.join(" ") + " " : "";
}

function computeHeadings(paragraphs: DocParagraph[]): { level: number; text: string; index: number; styleBuiltIn?: string }[] {
  return paragraphs
    .filter((p) => p.outlineLevel >= 1 && p.outlineLevel <= 6 && p.text.trim().length > 0)
    .map((p) => ({ level: p.outlineLevel, text: p.text.trim(), index: p.index, styleBuiltIn: p.styleBuiltIn }));
}

const FULL_TEXT_LIMIT = 5000;
const OUTLINE_ENTRY_LIMIT = 120;
const PARAGRAPH_PREVIEW_LIMIT = 80;

async function buildWordDocState(): Promise<string> {
  if (!isInsideOffice() || typeof Word === "undefined") {
    return "<doc_state>\n[Dev mode] No document loaded.\n</doc_state>";
  }

  try {
    const data = await Word.run(async (context) => {
      const body = context.document.body;
      body.load("text");
      const allInlinePics = body.inlinePictures;
      allInlinePics.load("items");
      const allParas = body.paragraphs;
      allParas.load("items");
      await context.sync();

      const totalParas = allParas.items.length;
      const fullText = body.text;
      const inlinePictureCount = allInlinePics.items.length;
      const totalWords = fullText.split(/\s+/).filter(Boolean).length;
      const totalChars = fullText.length;
      const isSmallDoc = totalChars <= FULL_TEXT_LIMIT;

      // Only load metadata for preview range (first 80 paragraphs)
      const loadCount = Math.min(totalParas, PARAGRAPH_PREVIEW_LIMIT);
      for (let i = 0; i < loadCount; i++) {
        const p = allParas.items[i];
        p.load("text, styleBuiltIn, outlineLevel, pageBreakBefore");
        p.listItemOrNullObject.load("isNullObject, listString, level");
        p.inlinePictures.load("items");
      }
      await context.sync();

      const paragraphs: DocParagraph[] = [];
      for (let i = 0; i < loadCount; i++) {
        const p = allParas.items[i];
        const li = p.listItemOrNullObject;
        paragraphs.push({
          text: p.text,
          styleBuiltIn: p.styleBuiltIn && p.styleBuiltIn !== "Other" ? p.styleBuiltIn : undefined,
          outlineLevel: p.outlineLevel || 0,
          isListItem: !li.isNullObject,
          listString: !li.isNullObject ? li.listString : undefined,
          hasInlinePicture: p.inlinePictures.items.length > 0,
          hasPageBreak: p.text.includes("\f"),
          hasPageBreakBefore: !!((p as unknown as { pageBreakBefore?: boolean }).pageBreakBefore),
          index: i,
        });
      }

      const headings = computeHeadings(paragraphs);

      return { paragraphs, totalParas, inlinePictureCount, headings, totalWords, totalChars, fullText, isSmallDoc };
    });

    const lines: string[] = [];
    lines.push("<doc_state>");
    lines.push(`Paragraphs: ${data.totalParas}`);
    lines.push(`Words: ${data.totalWords}`);
    if (data.inlinePictureCount > 0) {
      lines.push(`Inline images: ${data.inlinePictureCount}`);
    }

    if (data.headings.length > 0) {
      lines.push("");
      lines.push("--- Outline ---");
      for (const h of data.headings.slice(0, OUTLINE_ENTRY_LIMIT)) {
        const indent = "  ".repeat(h.level - 1);
        lines.push(`${indent}[${h.level}] ${h.text}`);
      }
      if (data.headings.length > OUTLINE_ENTRY_LIMIT) {
        lines.push(`  ... (${data.headings.length - OUTLINE_ENTRY_LIMIT} more)`);
      }
    }

    const pageBreakBeforeIndices = data.paragraphs
      .filter((p) => p.hasPageBreakBefore)
      .map((p) => p.index);
    const pageBreakIndices = data.paragraphs
      .filter((p) => p.hasPageBreak)
      .map((p) => p.index);
    if (pageBreakBeforeIndices.length > 0 || pageBreakIndices.length > 0) {
      lines.push("");
      lines.push("--- Page Breaks ---");
      if (pageBreakBeforeIndices.length > 0) {
        lines.push(`pageBreakBefore set on paragraph(s): [${pageBreakBeforeIndices.join(", ")}]`);
      }
      if (pageBreakIndices.length > 0) {
        lines.push(`manual break char (\\f) in paragraph(s): [${pageBreakIndices.join(", ")}]`);
      }
    }

    if (data.isSmallDoc) {
      lines.push("");
      lines.push("--- Full Text ---");
      const textToShow = data.fullText.slice(0, FULL_TEXT_LIMIT);
      const paraLines = textToShow.split(/\n/);
      for (let i = 0; i < Math.min(paraLines.length, data.paragraphs.length); i++) {
        const p = data.paragraphs[i];
        if (!p) continue;
        const marker = buildParagraphMarker(p);
        const text = paraLines[i] || p.text;
        if (text.trim() || marker) {
          lines.push(`${marker}${text}`);
        }
      }
      if (data.totalChars > FULL_TEXT_LIMIT) {
        lines.push(`... (truncated, ${data.totalChars - FULL_TEXT_LIMIT} more chars)`);
      }
    } else {
      lines.push("");
      lines.push(`--- First ${PARAGRAPH_PREVIEW_LIMIT} paragraphs ---`);
      for (let i = 0; i < Math.min(data.totalParas, PARAGRAPH_PREVIEW_LIMIT); i++) {
        const p = data.paragraphs[i];
        if (!p || !p.text.trim()) continue;
        const marker = buildParagraphMarker(p);
        const text = p.text.length > 200 ? p.text.slice(0, 200) + "…" : p.text;
        lines.push(`[${i}] ${marker}${text}`);
      }
      if (data.totalParas > PARAGRAPH_PREVIEW_LIMIT) {
        lines.push(`... (${data.totalParas - PARAGRAPH_PREVIEW_LIMIT} more paragraphs)`);
      }
    }

    lines.push("</doc_state>");
    return lines.join("\n");
  } catch (err) {
    return `<doc_state>\nError reading document: ${(err as Error).message}\n</doc_state>`;
  }
}

async function buildWordUserSelection(): Promise<string> {
  if (!isInsideOffice() || typeof Word === "undefined") return "";

  try {
    const info = await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load("text");
      await context.sync();
      const selText = selection.text.trim();
      if (!selText) return null;
      return { text: selText };
    });

    if (!info || !info.text) return "";

    const lines: string[] = [];
    lines.push("<user_selection>");
    lines.push(info.text.length > 1000 ? info.text.slice(0, 1000) + "…" : info.text);
    lines.push("</user_selection>");
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const EXCEL_PREVIEW_ROWS = 10;
const EXCEL_PREVIEW_COLS = 8;

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  const str = String(value);
  return str.length > 30 ? str.slice(0, 30) + "…" : str;
}

async function buildExcelDocState(): Promise<string> {
  if (!isInsideOffice() || typeof Excel === "undefined") {
    return "<doc_state>\n[Dev mode] No workbook loaded.\n</doc_state>";
  }

  try {
    const data = await Excel.run(async (context) => {
      const workbook = context.workbook;
      workbook.load("name");
      const worksheets = workbook.worksheets;
      worksheets.load("items/name");
      await context.sync();

      const sheetInfos: { name: string; rows: number; cols: number; preview: (string | number | boolean | null)[][] }[] = [];

      for (let i = 0; i < worksheets.items.length; i++) {
        const ws = worksheets.items[i];
        const used = ws.getUsedRange();
        used.load("rowCount, columnCount, address");
        used.load("values");
        await context.sync();

        const rows = used.rowCount;
        const cols = used.columnCount;

        const preview: (string | number | boolean | null)[][] = [];
        const previewRowCount = Math.min(rows, EXCEL_PREVIEW_ROWS);
        const previewColCount = Math.min(cols, EXCEL_PREVIEW_COLS);
        for (let r = 0; r < previewRowCount; r++) {
          const row: (string | number | boolean | null)[] = [];
          for (let c = 0; c < previewColCount; c++) {
            const v = (used.values as unknown[][])?.[r]?.[c];
            row.push((v as string | number | boolean | null) ?? null);
          }
          preview.push(row);
        }

        sheetInfos.push({ name: ws.name, rows, cols, preview });
      }

      const active = workbook.worksheets.getActiveWorksheet();
      active.load("name");
      await context.sync();

      return { workbookName: workbook.name, activeSheet: active.name, sheets: sheetInfos };
    });

    const lines: string[] = [];
    lines.push("<doc_state>");
    lines.push(`Workbook: ${data.workbookName}`);
    lines.push(`Worksheets: ${data.sheets.length}`);
    lines.push(`Active sheet: ${data.activeSheet}`);

    for (const sheet of data.sheets) {
      lines.push("");
      lines.push(`--- Sheet "${sheet.name}" (${sheet.rows} rows × ${sheet.cols} cols) ---`);
      if (sheet.rows === 0) {
        lines.push("(empty)");
        continue;
      }
      for (let r = 0; r < sheet.preview.length; r++) {
        const row = sheet.preview[r];
        const rowLabel = r + 1;
        lines.push(`[${rowLabel}] ${row.map(formatCellValue).join(" | ")}`);
      }
      if (sheet.rows > EXCEL_PREVIEW_ROWS) {
        lines.push(`... (${sheet.rows - EXCEL_PREVIEW_ROWS} more rows)`);
      }
      if (sheet.cols > EXCEL_PREVIEW_COLS) {
        lines.push(`... (${sheet.cols - EXCEL_PREVIEW_COLS} more columns)`);
      }
    }

    lines.push("</doc_state>");
    return lines.join("\n");
  } catch (err) {
    return `<doc_state>\nError reading workbook: ${(err as Error).message}\n</doc_state>`;
  }
}

async function buildExcelUserSelection(): Promise<string> {
  if (!isInsideOffice() || typeof Excel === "undefined") return "";

  try {
    const info = await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("address");
      range.load("values");
      await context.sync();

      const values = range.values as unknown[][];
      const hasData = values.some((row) => row.some((v) => v !== null && v !== undefined && String(v).trim() !== ""));
      if (!hasData) return null;
      return { address: range.address, values: values.map((row) => row.map(formatCellValue)) };
    });

    if (!info) return "";

    const lines: string[] = [];
    lines.push("<user_selection>");
    lines.push(`Range: ${info.address}`);
    for (const row of info.values) {
      lines.push(row.join(" | "));
    }
    lines.push("</user_selection>");
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// PowerPoint
// ---------------------------------------------------------------------------

const PPT_PREVIEW_SLIDES = 20;

async function buildPowerPointDocState(): Promise<string> {
  if (!isInsideOffice() || typeof PowerPoint === "undefined") {
    return "<doc_state>\n[Dev mode] No presentation loaded.\n</doc_state>";
  }

  try {
    const data = await PowerPoint.run(async (context) => {
      context.presentation.load("title");
      const slides = context.presentation.slides;
      slides.load("items/id");
      await context.sync();

      const outline: { position: number; slideId: string; layout: string; title: string; shapes: number }[] = [];
      const loadCount = Math.min(slides.items.length, PPT_PREVIEW_SLIDES);
      for (let i = 0; i < loadCount; i++) {
        const slide = slides.items[i];
        const shapes = slide.shapes;
        shapes.load("items/id, items/name, items/textFrame/textRange/text");
        const layout = slide.layout;
        layout.load("name");
        await context.sync();

        let title = "";
        for (const shape of shapes.items) {
          const t = shape.textFrame?.textRange?.text?.trim() ?? "";
          if (t) {
            title = t.length > 80 ? t.slice(0, 80) + "…" : t;
            break;
          }
        }
        outline.push({
          position: i + 1,
          slideId: slide.id,
          layout: layout.name || "",
          title,
          shapes: shapes.items.length,
        });
      }

      return {
        title: context.presentation.title || "",
        totalSlides: slides.items.length,
        outline,
      };
    });

    const lines: string[] = [];
    lines.push("<doc_state>");
    lines.push(`Presentation: ${data.title || "(untitled)"}`);
    lines.push(`Slides: ${data.totalSlides}`);

    for (const s of data.outline) {
      const title = s.title ? ` — "${s.title}"` : "";
      lines.push(`[${s.position}] slide ${s.slideId} (${s.layout}, ${s.shapes} shapes)${title}`);
    }
    if (data.totalSlides > PPT_PREVIEW_SLIDES) {
      lines.push(`... (${data.totalSlides - PPT_PREVIEW_SLIDES} more slides)`);
    }

    lines.push("</doc_state>");
    return lines.join("\n");
  } catch (err) {
    return `<doc_state>\nError reading presentation: ${(err as Error).message}\n</doc_state>`;
  }
}

async function buildPowerPointUserSelection(): Promise<string> {
  // PowerPoint.js has no selection API — the user_selection block is unavailable.
  return "";
}

/** Build the current host's document/workbook state snapshot for the model. */
export async function buildDocState(): Promise<string> {
  if (getHost() === "excel") return buildExcelDocState();
  if (getHost() === "powerpoint") return buildPowerPointDocState();
  return buildWordDocState();
}

/** Build the current host's user-selection snapshot for the model. */
export async function buildUserSelection(): Promise<string> {
  if (getHost() === "excel") return buildExcelUserSelection();
  if (getHost() === "powerpoint") return buildPowerPointUserSelection();
  return buildWordUserSelection();
}
