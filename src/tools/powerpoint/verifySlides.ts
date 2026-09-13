import type { ToolDefinition } from "../../providers/types";
import { toolRegistry } from "../registry";
import { isInsideOffice } from "../../office";
import { withSlideZip, getSlideXmlFromZip, parseSlideShapes, shapeAncestor } from "./pptx";

const SLIDE_WIDTH = 960; // 13.33in in points (16:9)
const SLIDE_HEIGHT = 540; // 7.5in in points

/** WCAG-relative luminance of a hex color. */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Compute the WCAG AA contrast ratio between two hex colors (0-1 each). */
function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A full-bleed background rectangle covers essentially the whole slide. Such a
 * shape intentionally overlaps everything on it. Whether that is fine depends
 * on stacking order: behind the content it is a legitimate background; in front
 * of it, it hides the content (a z-order bug). Callers must compare this shape's
 * `order` against the shapes it overlaps.
 */
function isFullBleedBackground(
  s: { left?: number; top?: number; width?: number; height?: number }
): boolean {
  if (s.left === undefined || s.top === undefined || s.width === undefined || s.height === undefined) {
    return false;
  }
  const area = s.width * s.height;
  const slideArea = SLIDE_WIDTH * SLIDE_HEIGHT;
  // Covers >= 98% of the slide.
  return area / slideArea >= 0.98;
}

const verifySlides: ToolDefinition = {
  name: "verify_slides",
  host: "powerpoint",
  description:
    "Verify slides for overlapping shapes, out-of-bounds positioning, low-contrast text, and z-order problems. " +
    "Returns structured results per slide. " +
    "A z_order_warnings array lists cases where a full-bleed background is stacked IN FRONT of content it covers " +
    "(the text is hidden) — fix by re-inserting the background so it sits behind the content. " +
    "When a shape's font color fails WCAG AA (4.5:1) against its own solid fill, a contrast_warnings array " +
    "lists {shape_id, shape_name, font_color, bg_color, ratio, msg} — fix each before declaring the slide done. " +
    "Call with a slide range (from_slide / to_slide, 0-based) for large decks to avoid truncation.",
  parameters: {
    type: "object",
    properties: {
      from_slide: {
        type: "number",
        description: "0-based starting slide index (inclusive). Defaults to 0.",
      },
      to_slide: {
        type: "number",
        description: "0-based ending slide index (inclusive). Defaults to the last slide.",
      },
      action_description: {
        type: "string",
        description: "Short human-readable description. E.g. 'Checking slide layout for overlaps', 'Verifying contrast'.",
      },
    },
  },
};

toolRegistry.register(verifySlides, async (args) => {
  const fromSlide = args.from_slide as number | undefined;
  const toSlide = args.to_slide as number | undefined;

  if (isInsideOffice() && typeof PowerPoint !== "undefined") {
    try {
      const result = await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items/id");
        await context.sync();

        const total = slides.items.length;
        const start = Math.max(0, fromSlide ?? 0);
        const end = Math.min(total - 1, toSlide ?? total - 1);

        const perSlide: {
          slideId: string;
          position: number;
          overlaps: { shape_ids: string[]; names: string[]; msg: string }[];
          out_of_bounds: { shape_id: string; name: string; msg: string }[];
          z_order_warnings: {
            shape_id: string;
            shape_name: string;
            hidden_shape_id: string;
            hidden_shape_name: string;
            msg: string;
          }[];
          contrast_warnings: {
            shape_id: string;
            shape_name: string;
            font_color: string;
            bg_color: string;
            ratio: number;
            msg: string;
          }[];
        }[] = [];

        for (let i = start; i <= end; i++) {
          const slideId = slides.items[i].id;
          const info = await withSlideZip(context, slideId, async ({ zip }) => {
            const xml = await getSlideXmlFromZip(zip);
            return analyzeSlide(xml);
          });
          const analysis = info.result as ReturnType<typeof analyzeSlide>;
          perSlide.push({
            slideId,
            position: i + 1,
            ...analysis,
          });
        }

        return { total_slides: total, from_slide: start, to_slide: end, slides: perSlide };
      });

      return JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }

  return JSON.stringify({
    total_slides: 2,
    from_slide: 0,
    to_slide: 1,
    slides: [
      {
        slideId: "256",
        position: 1,
        overlaps: [],
        out_of_bounds: [],
        z_order_warnings: [],
        contrast_warnings: [],
      },
      {
        slideId: "257",
        position: 2,
        overlaps: [],
        out_of_bounds: [],
        z_order_warnings: [],
        contrast_warnings: [],
      },
    ],
    dev_note: "[Dev mode] verify_slides",
  });
});

export function analyzeSlide(xml: string): {
  overlaps: { shape_ids: string[]; names: string[]; msg: string }[];
  out_of_bounds: { shape_id: string; name: string; msg: string }[];
  z_order_warnings: {
    shape_id: string;
    shape_name: string;
    hidden_shape_id: string;
    hidden_shape_name: string;
    msg: string;
  }[];
  contrast_warnings: {
    shape_id: string;
    shape_name: string;
    font_color: string;
    bg_color: string;
    ratio: number;
    msg: string;
  }[];
} {
  const shapes = parseSlideShapes(xml).filter((s) => !s.isGroup);

  const overlaps: { shape_ids: string[]; names: string[]; msg: string }[] = [];
  const out_of_bounds: { shape_id: string; name: string; msg: string }[] = [];
  const z_order_warnings: {
    shape_id: string;
    shape_name: string;
    hidden_shape_id: string;
    hidden_shape_name: string;
    msg: string;
  }[] = [];
  const contrast_warnings: {
    shape_id: string;
    shape_name: string;
    font_color: string;
    bg_color: string;
    ratio: number;
    msg: string;
  }[] = [];

  for (const s of shapes) {
    if (
      s.left === undefined || s.top === undefined ||
      s.width === undefined || s.height === undefined
    ) {
      continue;
    }

    // Out of bounds
    if (s.left < 0 || s.top < 0 || s.left + s.width > SLIDE_WIDTH || s.top + s.height > SLIDE_HEIGHT) {
      out_of_bounds.push({
        shape_id: s.id,
        name: s.name || s.id,
        msg: `Shape "${s.name || s.id}" (${Math.round(s.left)},${Math.round(s.top)} ${Math.round(s.width)}x${Math.round(s.height)}) is outside the slide bounds (${SLIDE_WIDTH}x${SLIDE_HEIGHT}pt).`,
      });
    }

    // Overlap with any other non-group shape. A full-bleed background covering
    // the whole slide is only legitimate when it is BEHIND the content it
    // overlaps (lower order). If it sits in front (higher order), it hides the
    // content and that is a z-order bug worth reporting.
    for (const other of shapes) {
      if (other.id === s.id) continue;
      if (
        other.left === undefined || other.top === undefined ||
        other.width === undefined || other.height === undefined
      ) {
        continue;
      }
      const xOverlap = Math.min(s.left + s.width, other.left + other.width) - Math.max(s.left, other.left);
      const yOverlap = Math.min(s.top + s.height, other.top + other.height) - Math.max(s.top, other.top);
      if (xOverlap <= 0 || yOverlap <= 0) continue;

      const sBg = isFullBleedBackground(s);
      const otherBg = isFullBleedBackground(other);

      if (sBg || otherBg) {
        // Background vs content: fine only when the background is behind.
        const bg = sBg ? s : other;
        const content = sBg ? other : s;
        if (bg.order < content.order) continue; // legitimate background
        z_order_warnings.push({
          shape_id: bg.id,
          shape_name: bg.name || bg.id,
          hidden_shape_id: content.id,
          hidden_shape_name: content.name || content.id,
          msg:
            `Background "${bg.name || bg.id}" (${Math.round(bg.width ?? 0)}x${Math.round(bg.height ?? 0)}pt) is stacked IN FRONT of ` +
            `"${content.name || content.id}" and hides it (order ${bg.order} > ${content.order}). ` +
            "Re-insert the background so it sits behind the content.",
        });
        continue;
      }

      overlaps.push({
        shape_ids: [s.id, other.id],
        names: [s.name || s.id, other.name || other.id],
        msg: `Shapes "${s.name || s.id}" and "${other.name || other.id}" overlap (${Math.round(xOverlap)}x${Math.round(yOverlap)}pt).`,
      });
    }

    // Contrast: font color (from text runs) vs solid fill
    if (s.fillColor && s.type === "shape") {
      const textXml = extractFirstTextColor(xml, s.id);
      if (textXml) {
        const ratio = contrastRatio(textXml, s.fillColor);
        if (ratio < 4.5) {
          contrast_warnings.push({
            shape_id: s.id,
            shape_name: s.name || s.id,
            font_color: textXml,
            bg_color: s.fillColor,
            ratio: Math.round(ratio * 100) / 100,
            msg: `Text color #${textXml} on fill #${s.fillColor} has contrast ${Math.round(ratio * 100) / 100}:1 — below WCAG AA (4.5:1).`,
          });
        }
      }
    }
  }

  return { overlaps, out_of_bounds, z_order_warnings, contrast_warnings };
}

/** Extract the first solidFill text color from a shape's runs, if any. */
function extractFirstTextColor(xml: string, shapeId: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";

  const allCnvPr = root.getElementsByTagNameNS(NS_P, "cNvPr");
  for (let i = 0; i < allCnvPr.length; i++) {
    if (allCnvPr[i].getAttribute("id") !== shapeId) continue;
    const shapeEl = shapeAncestor(allCnvPr[i]);
    if (!shapeEl) continue;
    const rPrs = shapeEl.getElementsByTagNameNS(NS_A, "rPr");
    for (let j = 0; j < rPrs.length; j++) {
      const solidFill = rPrs[j].getElementsByTagNameNS(NS_A, "solidFill")[0];
      if (!solidFill) continue;
      const srgb = solidFill.getElementsByTagNameNS(NS_A, "srgbClr")[0];
      if (srgb?.getAttribute("val")) return srgb.getAttribute("val");
    }
  }
  return null;
}
