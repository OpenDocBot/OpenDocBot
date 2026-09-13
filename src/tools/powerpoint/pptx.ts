/**
 * PowerPoint OOXML infrastructure.
 *
 * PowerPoint.js (even PowerPointApi 1.8) cannot do per-run text styling, tables,
 * charts, or master editing through its structured API. The reliable way to
 * read/write that is to manipulate the slide's OOXML directly:
 *
 *   - Read:  `Office.context.document.getFileAsync("Compressed")` returns the
 *            whole .pptx as slices; load into JSZip; parse the slide XML parts.
 *   - Write: `slide.exportAsBase64()` (PowerPointApi 1.8) returns a standalone
 *            .pptx containing just that slide; edit the XML in JSZip; re-zip;
 *            `insertSlidesFromBase64()` to re-insert the edited slide right
 *            after its previous sibling; then delete the original slide.
 *
 * Everything in this module is pure/testable where possible; the Office.js
 * glue is isolated in small functions so the XML parsing/editing can be unit
 * tested with raw strings.
 */

import JSZip from "jszip";

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

/** Escape a string for safe embedding as XML text content. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Un-escape XML entities back to raw text. */
export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Slide XML parsing (pure)
// ---------------------------------------------------------------------------

/** Shape metadata extracted from a slide's OOXML. */
export interface ParsedShape {
  id: string;
  name: string;
  type: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  placeholder?: string;
  /** Short plain-text preview of the shape's text (first 200 chars). */
  textPreview?: string;
  /** Solid fill color of the shape (hex, no '#'), if present. */
  fillColor?: string;
  /** Stacking position in the shape tree: 0 is the back, highest is the front. */
  order: number;
  isGroup?: boolean;
  /** For group children: the parent group's shape id. */
  parentId?: string;
  /** For tables: number of rows / columns. */
  tableRows?: number;
  tableCols?: number;
}

/** A single formatted run of text inside a paragraph. */
export interface ParsedRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
  font?: string;
}

/** A paragraph of text: one or more runs plus paragraph-level alignment. */
export interface ParsedParagraph {
  runs: ParsedRun[];
  alignment?: string;
  /** True if the paragraph is a bullet / numbered list item. */
  isBullet?: boolean;
  indentLevel?: number;
}

// Presentation XML namespace and drawing namespace (constants for parsing).
const PRESENTATIONML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

/**
 * Parse a slide XML string and return a flattened list of shapes.
 * Group children are listed inline with `parentId` set to the group's id.
 */
export function parseSlideShapes(slideXml: string): ParsedShape[] {
  const doc = new DOMParser().parseFromString(slideXml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Invalid slide XML");
  }

  const shapes: ParsedShape[] = [];
  const root = doc.documentElement;

  function readShape(el: Element, parentId?: string): ParsedShape | null {
    const cNvPr = el.getElementsByTagNameNS(PRESENTATIONML_NS, "cNvPr")[0]
      ?? el.getElementsByTagNameNS(DRAWINGML_NS, "cNvPr")[0];
    if (!cNvPr) return null;

    const id = cNvPr.getAttribute("id") || cNvPr.getAttribute("name") || "";
    const name = cNvPr.getAttribute("name") || "";

    const shape: ParsedShape = {
      id,
      name,
      type: "shape",
      order: 0,
      ...(parentId ? { parentId } : {}),
    };

    // Placeholder kind (p:ph)
    const ph = el.getElementsByTagNameNS(PRESENTATIONML_NS, "ph")[0];
    if (ph) {
      shape.placeholder = ph.getAttribute("type") || "body";
    }

    // Bounding box: a:xfrm → a:off (x,y) + a:ext (cx,cy) in EMU (12700 per pt)
    const xfrm = el.getElementsByTagNameNS(DRAWINGML_NS, "xfrm")[0];
    if (xfrm) {
      const off = xfrm.getElementsByTagNameNS(DRAWINGML_NS, "off")[0];
      const ext = xfrm.getElementsByTagNameNS(DRAWINGML_NS, "ext")[0];
      const cx = off?.getAttribute("x");
      const cy = off?.getAttribute("y");
      if (cx !== undefined && cx !== null) shape.left = Number(cx) / 12700;
      if (cy !== undefined && cy !== null) shape.top = Number(cy) / 12700;
      const w = ext?.getAttribute("cx");
      const h = ext?.getAttribute("cy");
      if (w !== undefined && w !== null) shape.width = Number(w) / 12700;
      if (h !== undefined && h !== null) shape.height = Number(h) / 12700;
    }

    // Group?
    shape.isGroup = el.localName === "grpSp";

    // Table?
    if (el.localName === "graphicFrame") {
      const tbl = el.getElementsByTagNameNS(DRAWINGML_NS, "tbl")[0];
      if (tbl) {
        shape.type = "table";
        shape.tableRows = tbl.getElementsByTagNameNS(DRAWINGML_NS, "tr").length;
        const firstRow = tbl.getElementsByTagNameNS(DRAWINGML_NS, "tr")[0];
        shape.tableCols = firstRow
          ? firstRow.getElementsByTagNameNS(DRAWINGML_NS, "tc").length
          : 0;
      } else {
        shape.type = "chart";
      }
    }

    // Picture?
    if (el.localName === "pic") {
      shape.type = "image";
    }

    // Solid fill color: p:spPr/p:blipFill vs a:solidFill → a:srgbClr
    const spPr = el.getElementsByTagNameNS(PRESENTATIONML_NS, "spPr")[0];
    if (spPr) {
      const solidFill = spPr.getElementsByTagNameNS(DRAWINGML_NS, "solidFill")[0];
      if (solidFill) {
        const srgb = solidFill.getElementsByTagNameNS(DRAWINGML_NS, "srgbClr")[0];
        if (srgb) shape.fillColor = srgb.getAttribute("val") || undefined;
      }
    }

    // Text preview
    const txBody = el.getElementsByTagNameNS(PRESENTATIONML_NS, "txBody")[0];
    if (txBody) {
      const text = extractTextFromTxBody(txBody);
      if (text) {
        shape.textPreview = text.length > 200 ? text.slice(0, 200) + "…" : text;
      }
    }

    return shape;
  }

  function walk(el: Element, parentId?: string): void {
    // p:sp (shape), p:pic (picture), p:graphicFrame (table/chart), p:grpSp (group)
    for (const child of Array.from(el.children)) {
      const local = child.localName || "";
      if (local === "sp" || local === "pic" || local === "graphicFrame") {
        const shape = readShape(child, parentId);
        if (shape) {
          shape.order = shapes.length;
          shapes.push(shape);
        }
      } else if (local === "grpSp") {
        const group = readShape(child, parentId);
        if (group) {
          group.order = shapes.length;
          shapes.push(group);
          walk(child, group.id);
        }
      }
    }
  }

  // Shapes live inside p:spTree (under p:cSld); descend to it if needed.
  const spTree = root.getElementsByTagNameNS(PRESENTATIONML_NS, "spTree")[0]
    ?? root;
  walk(spTree);
  return shapes;
}

/** Extract plain text (newline-joined paragraphs) from a p:txBody element. */
function extractTextFromTxBody(txBody: Element): string {
  const paras = txBody.getElementsByTagNameNS(DRAWINGML_NS, "p");
  const lines: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const tEls = paras[i].getElementsByTagNameNS(DRAWINGML_NS, "t");
    let line = "";
    for (let j = 0; j < tEls.length; j++) {
      line += unescapeXml(tEls[j].textContent || "");
    }
    lines.push(line);
  }
  return lines.join("\n").trim();
}

/** Climb from a cNvPr element to the containing shape (sp/pic/graphicFrame/grpSp). */
export function shapeAncestor(el: Element): Element {
  let node = el.parentElement;
  while (node) {
    const local = node.localName || "";
    if (local === "sp" || local === "pic" || local === "graphicFrame" || local === "grpSp") {
      return node;
    }
    node = node.parentElement;
  }
  return el.parentElement ?? el;
}

/**
 * Move a shape (identified by its cNvPr name) to the back of the stacking
 * order: its XML node becomes the first shape child of p:spTree, right after
 * the group properties (p:nvGrpSpPr and p:grpSpPr). Only top-level shapes can
 * be reordered (a shape nested inside a group cannot). Returns the edited slide
 * XML. Throws if the shape is not found or is not a direct spTree child.
 */
export function moveShapeToBack(slideXml: string, shapeName: string): string {
  const doc = new DOMParser().parseFromString(slideXml, "application/xml");
  const root = doc.documentElement;
  const spTree = root.getElementsByTagNameNS(PRESENTATIONML_NS, "spTree")[0];
  if (!spTree) throw new Error("Slide has no spTree.");

  const allCnvPr = root.getElementsByTagNameNS(PRESENTATIONML_NS, "cNvPr");
  let target: Element | null = null;
  for (let i = 0; i < allCnvPr.length; i++) {
    if (allCnvPr[i].getAttribute("name") === shapeName) {
      target = shapeAncestor(allCnvPr[i]);
      break;
    }
  }
  if (!target) {
    throw new Error(`Shape "${shapeName}" not found in slide; cannot send it to the back.`);
  }
  if (target.parentElement !== spTree) {
    throw new Error(
      `Shape "${shapeName}" is nested inside a group and cannot be sent to the back. ` +
      "Re-insert it as a top-level shape instead."
    );
  }

  // First shape child of spTree is the back of the stack. Shapes are preceded
  // by p:nvGrpSpPr and p:grpSpPr, which we must leave untouched.
  const firstShape = Array.from(spTree.children).find((c) => {
    const local = c.localName || "";
    return local === "sp" || local === "pic" || local === "graphicFrame" || local === "grpSp";
  });

  if (firstShape === target) return slideXml; // already at the back

  spTree.removeChild(target);
  // Re-find the first shape child after the removal (target may have been it).
  const anchor = Array.from(spTree.children).find((c) => {
    const local = c.localName || "";
    return local === "sp" || local === "pic" || local === "graphicFrame" || local === "grpSp";
  });
  spTree.insertBefore(target, anchor ?? null);

  return new XMLSerializer().serializeToString(doc);
}

/**
 * Parse the styled text of a shape into paragraphs with per-run formatting.
 * Returns an empty array when the shape has no text body.
 */
export function parseShapeText(slideXml: string, shapeId: string): ParsedParagraph[] {
  const doc = new DOMParser().parseFromString(slideXml, "application/xml");
  const root = doc.documentElement;

  // Find the shape by its cNvPr id attribute.
  const allCnvPr = root.getElementsByTagNameNS(PRESENTATIONML_NS, "cNvPr");
  let target: Element | null = null;
  for (let i = 0; i < allCnvPr.length; i++) {
    if (allCnvPr[i].getAttribute("id") === shapeId) {
      target = shapeAncestor(allCnvPr[i]);
      break;
    }
  }
  if (!target) {
    throw new Error(`Shape id "${shapeId}" not found in slide. Call list_slide_shapes first.`);
  }

  const txBody = target.getElementsByTagNameNS(PRESENTATIONML_NS, "txBody")[0];
  if (!txBody) {
    throw new Error(`Shape "${shapeId}" has no text body (it may be an image or connector).`);
  }

  const paragraphs: ParsedParagraph[] = [];
  const aP = txBody.getElementsByTagNameNS(DRAWINGML_NS, "p");
  for (let i = 0; i < aP.length; i++) {
    const para = parseParagraph(aP[i]);
    if (para) paragraphs.push(para);
  }
  return paragraphs;
}

function parseParagraph(pEl: Element): ParsedParagraph | null {
  const runs: ParsedRun[] = [];
  const aR = pEl.getElementsByTagNameNS(DRAWINGML_NS, "r");
  for (let i = 0; i < aR.length; i++) {
    const run = parseRun(aR[i]);
    if (run) runs.push(run);
  }

  if (runs.length === 0) return null;

  const paragraph: ParsedParagraph = { runs };

  // Alignment from pPr
  const pPr = pEl.getElementsByTagNameNS(DRAWINGML_NS, "pPr")[0];
  if (pPr) {
    const algn = pPr.getAttribute("algn");
    if (algn) paragraph.alignment = algn;
    paragraph.isBullet = pPr.getAttribute("marL") !== null && pPr.getAttribute("marL") !== "0";
    const lvl = pPr.getAttribute("lvl");
    if (lvl !== null) paragraph.indentLevel = Number(lvl);
  }

  return paragraph;
}

function parseRun(rEl: Element): ParsedRun | null {
  const tEl = rEl.getElementsByTagNameNS(DRAWINGML_NS, "t")[0];
  if (!tEl) return null;
  const text = tEl.textContent || "";
  if (text.length === 0) return null;

  const run: ParsedRun = { text: unescapeXml(text) };

  const rPr = rEl.getElementsByTagNameNS(DRAWINGML_NS, "rPr")[0];
  if (rPr) {
    if (rPr.getAttribute("b") === "1") run.bold = true;
    if (rPr.getAttribute("i") === "1") run.italic = true;
    const u = rPr.getAttribute("u");
    if (u && u !== "none") run.underline = true;
    const sz = rPr.getAttribute("sz");
    if (sz) run.size = Number(sz) / 100;
    const latin = rPr.getElementsByTagNameNS(DRAWINGML_NS, "latin")[0];
    if (latin) run.font = latin.getAttribute("typeface") || undefined;
    const solidFill = rPr.getElementsByTagNameNS(DRAWINGML_NS, "solidFill")[0];
    if (solidFill) {
      const srgb = solidFill.getElementsByTagNameNS(DRAWINGML_NS, "srgbClr")[0];
      if (srgb) run.color = srgb.getAttribute("val") || undefined;
    }
  }

  return run;
}

// ---------------------------------------------------------------------------
// Slide XML editing (pure)
// ---------------------------------------------------------------------------

/**
 * Build the `<a:p>` XML for one paragraph from parsed runs.
 * Used by edit_slide_text to construct new text bodies.
 */
export function buildParagraphXml(para: ParsedParagraph): string {
  const runsXml = para.runs
    .map((r) => {
      const rPrAttrs: string[] = [];
      if (r.bold) rPrAttrs.push('b="1"');
      if (r.italic) rPrAttrs.push('i="1"');
      if (r.underline) rPrAttrs.push('u="sng"');
      if (r.size) rPrAttrs.push(`sz="${Math.round(r.size * 100)}"`);
      // Fill group must precede the font group per CT_TextCharacterProperties
      // (schema order): solidFill first, then latin/ea/cs/sym.
      const rPrInner: string[] = [];
      if (r.color) {
        // Accept both '#RRGGBB' and bare 'RRGGBB'. srgbClr @val must be bare.
        const hex = r.color.replace(/^#/, "");
        rPrInner.push(`<a:solidFill><a:srgbClr val="${escapeXml(hex)}"/></a:solidFill>`);
      }
      if (r.font) rPrInner.push(`<a:latin typeface="${escapeXml(r.font)}"/>`);
      const rPr = rPrAttrs.length > 0
        ? `<a:rPr ${rPrAttrs.join(" ")}>${rPrInner.join("")}</a:rPr>`
        : `<a:rPr>${rPrInner.join("")}</a:rPr>`;
      return `<a:r>${rPr}<a:t>${escapeXml(r.text)}</a:t></a:r>`;
    })
    .join("");

  const pPrAttrs: string[] = [];
  if (para.alignment) pPrAttrs.push(`algn="${escapeXml(para.alignment)}"`);
  const pPr = pPrAttrs.length > 0 ? `<a:pPr ${pPrAttrs.join(" ")}/>` : "";

  return `<a:p>${pPr}${runsXml}</a:p>`;
}

/**
 * Replace the text body of a shape with the given paragraphs.
 * Returns the full modified slide XML. Throws if the shape is not found or
 * has no text body.
 */
export function setShapeText(
  slideXml: string,
  shapeId: string,
  paragraphs: ParsedParagraph[]
): string {
  const doc = new DOMParser().parseFromString(slideXml, "application/xml");
  const root = doc.documentElement;

  let target: Element | null = null;
  const allCnvPr = root.getElementsByTagNameNS(PRESENTATIONML_NS, "cNvPr");
  for (let i = 0; i < allCnvPr.length; i++) {
    if (allCnvPr[i].getAttribute("id") === shapeId) {
      target = shapeAncestor(allCnvPr[i]);
      break;
    }
  }
  if (!target) {
    throw new Error(`Shape id "${shapeId}" not found in slide. Call list_slide_shapes first.`);
  }

  const txBody = target.getElementsByTagNameNS(PRESENTATIONML_NS, "txBody")[0];
  if (!txBody) {
    throw new Error(`Shape "${shapeId}" has no text body (it may be an image or connector).`);
  }

  // Preserve the existing bodyPr/lstStyle attributes and any a:bodyPr child.
  const bodyPrXml = txBody
    .getElementsByTagNameNS(DRAWINGML_NS, "bodyPr")[0]
    ?.outerHTML ?? "";
  const lstStyleXml = txBody
    .getElementsByTagNameNS(DRAWINGML_NS, "lstStyle")[0]
    ?.outerHTML ?? "";

  const paragraphsXml = paragraphs
    .map((para) => buildParagraphXml(para))
    .join("");

  const newTxBodyXml =
    `<p:txBody xmlns:p="${PRESENTATIONML_NS}" xmlns:a="${DRAWINGML_NS}">` +
    bodyPrXml +
    lstStyleXml +
    paragraphsXml +
    `</p:txBody>`;

  const newTxBody = new DOMParser()
    .parseFromString(newTxBodyXml, "application/xml")
    .documentElement;

  target.replaceChild(newTxBody, txBody);

  return new XMLSerializer().serializeToString(root);
}

// ---------------------------------------------------------------------------
// Office.js glue
// ---------------------------------------------------------------------------

/** Promise wrapper around Office.context.document.getFileAsync. */
function getFileAsyncSlices(fileType: Office.FileType): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(fileType, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(result.error);
        return;
      }
      const file = result.value;
      const slices: Promise<ArrayBuffer>[] = [];
      for (let i = 0; i < file.sliceCount; i++) {
        slices.push(
          new Promise((res, rej) => {
            file.getSliceAsync(i, (sliceResult) => {
              if (sliceResult.status !== Office.AsyncResultStatus.Succeeded) {
                rej(sliceResult.error);
                return;
              }
              res(sliceResult.value.data);
            });
          })
        );
      }
      Promise.all(slices)
        .then((parts) => {
          const total = parts.reduce((acc, p) => acc + p.byteLength, 0);
          const out = new Uint8Array(total);
          let offset = 0;
          for (const part of parts) {
            out.set(new Uint8Array(part), offset);
            offset += part.byteLength;
          }
          file.closeAsync(() => {});
          resolve(out);
        })
        .catch(reject);
    });
  });
}

/**
 * Read the whole presentation as a JSZip. Useful for read-only inspection of
 * masters, layouts, themes, and slide XML across the whole deck.
 */
export async function readPresentationZip(): Promise<JSZip> {
  const data = await getFileAsyncSlices(Office.FileType.Compressed);
  return JSZip.loadAsync(data);
}

/** Convert a JSZip back to a base64 string. */
export async function zipToBase64(zip: JSZip): Promise<string> {
  return zip.generateAsync({ type: "base64" });
}

/**
 * Resolve a slide reference ("N" 1-based position, "last", or a slide id) to
 * the slide's index in the presentation.
 * Returns `{ index, slideId, total }`.
 */
export async function resolveSlideIndex(
  context: PowerPoint.RequestContext,
  ref: string
): Promise<{ index: number; slideId: string; total: number }> {
  const slides = context.presentation.slides;
  slides.load("items/id");
  await context.sync();

  const total = slides.items.length;
  const ids = slides.items.map((s) => s.id);
  if (total === 0) {
    throw new Error("The presentation has no slides.");
  }

  let index: number;
  if (ref === "last") {
    index = total - 1;
  } else if (ids.includes(ref)) {
    // Prefer an exact slide-id match (PowerPoint ids are numeric strings, so
    // "257" as a slide id must win over interpreting it as position 257).
    index = ids.indexOf(ref);
  } else if (/^\d+$/.test(ref)) {
    const pos = Number(ref);
    if (pos < 1 || pos > total) {
      throw new Error(
        `Slide position ${pos} is out of range (1-${total}). Available slide IDs: ${ids.join(", ")}`
      );
    }
    index = pos - 1;
  } else {
    throw new Error(`Slide "${ref}" not found. Available slide IDs: ${ids.join(", ")}`);
  }

  return { index, slideId: ids[index], total };
}

/**
 * Write back an edited single-slide pptx (from exportAsBase64) into the
 * presentation at the position of `slideId`.
 *
 * Mechanism: re-insert the edited slide right after its previous sibling
 * (or at the start if it was the first slide), then delete the original.
 *
 * NOTE: the re-import assigns NEW ids to the slide and all of its shapes.
 * Callers must re-read shape ids via list_slide_shapes before further edits.
 */
export async function writeSlideBack(
  context: PowerPoint.RequestContext,
  slideId: string,
  editedBase64: string
): Promise<{ newSlideId: string; index: number; warning?: string }> {
  const slides = context.presentation.slides;
  slides.load("items/id");
  await context.sync();

  const ids = slides.items.map((s) => s.id);
  const index = ids.indexOf(slideId);
  if (index < 0) {
    throw new Error(`Slide "${slideId}" not found when writing back.`);
  }

  const prevId = index > 0 ? ids[index - 1] : undefined;

  // Re-insert the edited slide after the previous sibling (or at the start).
  context.presentation.insertSlidesFromBase64(editedBase64, {
    ...(prevId ? { targetSlideId: prevId } : {}),
  });

  // Delete the original.
  slides.getItem(slideId).delete();
  await context.sync();

  // Reload ids: the edited slide is now at the same index.
  slides.load("items/id");
  await context.sync();
  const newId = slides.items[index]?.id ?? slideId;

  return {
    newSlideId: newId,
    index,
    warning:
      "Slide was re-imported — PowerPoint assigned new ids to the slide and every shape on it. " +
      "Re-run list_slide_shapes to get fresh shape ids before any further edits.",
  };
}

/**
 * Find the slide part inside a single-slide export zip.
 *
 * A standalone slide export (`slide.exportAsBase64()`) always contains exactly
 * one part under `ppt/slides/slideN.xml`, regardless of the slide's position in
 * the deck — the model must NEVER guess a position-based name like slide2.xml.
 */
export function resolveSlidePath(zip: JSZip): string {
  const candidates = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();
  return candidates[0] ?? "ppt/slides/slide1.xml";
}

/**
 * The core OOXML write primitive for a single slide.
 *
 * Runs `mutate` with a JSZip of the slide (exported standalone via
 * `slide.exportAsBase64`). If `markDirty()` was called, the zip is re-exported
 * as base64 and written back via `writeSlideBack`. Returns the mutated slide
 * XML and the new slide id (which changes after re-import).
 */
export async function withSlideZip(
  context: PowerPoint.RequestContext,
  slideId: string,
  mutate: (ctx: { zip: JSZip; markDirty: () => void; slidePath: string }) => Promise<unknown>
): Promise<{
  result: unknown;
  newSlideId: string;
  dirty: boolean;
  warning?: string;
  editedXml?: string;
}> {
  const slide = context.presentation.slides.getItem(slideId);
  const base64Result = slide.exportAsBase64();
  await context.sync();

  const zip = await JSZip.loadAsync(base64Result.value, { base64: true });
  const slidePath = resolveSlidePath(zip);
  let dirty = false;
  const result = await mutate({
    zip,
    markDirty: () => {
      dirty = true;
    },
    slidePath,
  });

  if (!dirty) {
    return { result, newSlideId: slideId, dirty: false };
  }

  // Capture the edited slide XML for post-write-back verification.
  let editedXml: string | undefined;
  const slidePart = zip.file(slidePath);
  if (slidePart) {
    editedXml = await slidePart.async("string");
  }

  const editedBase64 = await zipToBase64(zip);
  const { newSlideId, warning } = await writeSlideBack(context, slideId, editedBase64);
  return { result, newSlideId, dirty: true, warning, editedXml };
}

/** Read the slide XML string from a slide zip (single slide, always slide1). */
export async function getSlideXmlFromZip(zip: JSZip): Promise<string> {
  const path = resolveSlidePath(zip);
  const file = zip.file(path);
  if (!file) {
    throw new Error(`Slide export does not contain ${path}`);
  }
  return file.async("string");
}

/** Re-export a slide (by id) and return its slide XML string. */
export async function exportSlideXmlById(
  context: PowerPoint.RequestContext,
  slideId: string
): Promise<string> {
  const slide = context.presentation.slides.getItem(slideId);
  const base64Result = slide.exportAsBase64();
  await context.sync();
  const zip = await JSZip.loadAsync(base64Result.value, { base64: true });
  return getSlideXmlFromZip(zip);
}
