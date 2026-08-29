import { describe, it, expect } from "vitest";
import {
  escapeXml,
  unescapeXml,
  parseSlideShapes,
  parseShapeText,
  setShapeText,
  buildParagraphXml,
  moveShapeToBack,
} from "../../tools/powerpoint/pptx";

const SAMPLE_SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1371600"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p>
            <a:r><a:rPr lang="en-US" sz="4400" b="1"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:rPr><a:t>Q3 Sales Report</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content Placeholder 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="1748799"/>
            <a:ext cx="8229600" cy="3657600"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p>
            <a:r><a:t>Revenue grew 12% year over year.</a:t></a:r>
          </a:p>
          <a:p>
            <a:r><a:t>Second bullet with </a:t></a:r>
            <a:r><a:rPr i="1"/><a:t>italic</a:t></a:r>
            <a:r><a:t> text.</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="4" name="Picture 3"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId4"/></p:blipFill>
        <p:spPr/>
      </p:pic>
      <p:grpSp>
        <p:nvGrpSpPr>
          <p:cNvPr id="5" name="Group 4"/>
          <p:cNvGrpSpPr/>
          <p:nvPr/>
        </p:nvGrpSpPr>
        <p:grpSpPr/>
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="6" name="TextBox 5"/>
            <p:cNvSpPr/>
            <p:nvPr/>
          </p:nvSpPr>
          <p:spPr/>
          <p:txBody>
            <a:bodyPr/>
            <a:p><a:r><a:t>Inside group</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>
      </p:grpSp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr/>
</p:sld>`;

describe("escapeXml / unescapeXml", () => {
  it("escapes XML special characters", () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f"
    );
  });

  it("round-trips through unescapeXml", () => {
    const raw = `A <title> & "quotes" & 'single'`;
    expect(unescapeXml(escapeXml(raw))).toBe(raw);
  });
});

describe("parseSlideShapes", () => {
  it("flattens shapes, pictures, and group children", () => {
    const shapes = parseSlideShapes(SAMPLE_SLIDE);

    const title = shapes.find((s) => s.id === "2")!;
    expect(title).toBeDefined();
    expect(title.name).toBe("Title 1");
    expect(title.type).toBe("shape");
    expect(title.placeholder).toBe("title");
    expect(title.left).toBe(457200 / 12700);
    expect(title.top).toBe(274638 / 12700);
    expect(title.width).toBe(8229600 / 12700);
    expect(title.height).toBe(1371600 / 12700);
    expect(title.textPreview).toBe("Q3 Sales Report");

    const pic = shapes.find((s) => s.id === "4")!;
    expect(pic.type).toBe("image");
    expect(pic.textPreview).toBeUndefined();

    const group = shapes.find((s) => s.id === "5")!;
    expect(group.isGroup).toBe(true);

    const child = shapes.find((s) => s.id === "6")!;
    expect(child.parentId).toBe("5");
    expect(child.textPreview).toBe("Inside group");
  });

  it("handles empty slide XML gracefully", () => {
    const shapes = parseSlideShapes(
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sld>`
    );
    expect(shapes).toEqual([]);
  });

  it("reports stacking order (0 = back, ascending to front)", () => {
    const shapes = parseSlideShapes(SAMPLE_SLIDE);
    const ordered = shapes.map((s) => ({ id: s.id, order: s.order }));
    expect(ordered.find((s) => s.id === "2")?.order).toBe(0);
    expect(ordered.find((s) => s.id === "3")?.order).toBe(1);
    expect(ordered.find((s) => s.id === "4")?.order).toBe(2);
    expect(ordered.find((s) => s.id === "5")?.order).toBe(3);
    expect(ordered.find((s) => s.id === "6")?.order).toBe(4);
  });
});

describe("moveShapeToBack", () => {
  it("moves a shape to the back of the stack, after the group properties", () => {
    // SAMPLE_SLIDE ends with a group; add a background to the front.
    const xmlWithFrontBg = SAMPLE_SLIDE.replace(
      "</p:spTree>",
      `<p:sp><p:nvSpPr><p:cNvPr id="100" name="BG"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp></p:spTree>`
    );

    const edited = moveShapeToBack(xmlWithFrontBg, "BG");
    const shapes = parseSlideShapes(edited);
    expect(shapes[0].name).toBe("BG");
    expect(shapes[0].order).toBe(0);

    // The other shapes keep their relative order behind the new background.
    const ids = shapes.map((s) => s.id);
    expect(ids).toEqual(["100", "2", "3", "4", "5", "6"]);
  });

  it("returns the XML unchanged when the shape is already at the back", () => {
    const edited = moveShapeToBack(SAMPLE_SLIDE, "Title 1");
    expect(parseSlideShapes(edited).map((s) => s.id)).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("throws when the shape name is not present", () => {
    expect(() => moveShapeToBack(SAMPLE_SLIDE, "nope")).toThrow("not found");
  });
});

describe("parseShapeText", () => {
  it("returns paragraphs with per-run formatting", () => {
    const paras = parseShapeText(SAMPLE_SLIDE, "3");
    expect(paras.length).toBe(2);

    expect(paras[0].runs[0].text).toBe("Revenue grew 12% year over year.");

    const second = paras[1];
    expect(second.runs.length).toBe(3);
    expect(second.runs[1].text).toBe("italic");
    expect(second.runs[1].italic).toBe(true);
  });

  it("parses bold, size, color, font from title shape", () => {
    const paras = parseShapeText(SAMPLE_SLIDE, "2");
    const run = paras[0].runs[0];
    expect(run.bold).toBe(true);
    expect(run.size).toBe(44);
    expect(run.color).toBe("1F4E79");
  });

  it("throws for a non-existent shape", () => {
    expect(() => parseShapeText(SAMPLE_SLIDE, "999")).toThrow("not found");
  });

  it("throws for a non-text shape", () => {
    expect(() => parseShapeText(SAMPLE_SLIDE, "4")).toThrow("no text body");
  });
});

describe("buildParagraphXml / setShapeText", () => {
  it("builds valid paragraph XML with run formatting", () => {
    const xml = buildParagraphXml({
      runs: [
        { text: "Hello ", bold: true, size: 24 },
        { text: "world", color: "FF0000" },
      ],
      alignment: "ctr",
    });
    expect(xml).toContain('algn="ctr"');
    expect(xml).toContain('b="1"');
    expect(xml).toContain('sz="2400"');
    expect(xml).toContain('val="FF0000"');
    expect(xml).toContain("<a:t>Hello </a:t>");
    expect(xml).toContain("<a:t>world</a:t>");
  });

  it("strips the leading '#' from run colors in srgbClr val", () => {
    const xml = buildParagraphXml({
      runs: [{ text: "x", color: "#722F37" }],
    });
    expect(xml).toContain('val="722F37"');
    expect(xml).not.toContain('val="#722F37"');
  });

  it("emits solidFill before latin per the schema sequence", () => {
    const xml = buildParagraphXml({
      runs: [{ text: "x", color: "#722F37", font: "Georgia" }],
    });
    const solidIdx = xml.indexOf("<a:solidFill>");
    const latinIdx = xml.indexOf('<a:latin typeface="Georgia"/>');
    expect(solidIdx).toBeGreaterThan(-1);
    expect(latinIdx).toBeGreaterThan(-1);
    expect(solidIdx).toBeLessThan(latinIdx);
  });

  it("replaces a shape's text body and preserves other shapes", () => {
    const edited = setShapeText(SAMPLE_SLIDE, "3", [
      { runs: [{ text: "New heading", bold: true }] },
      { runs: [{ text: "Second line" }] },
    ]);

    const paras = parseShapeText(edited, "3");
    expect(paras.length).toBe(2);
    expect(paras[0].runs[0].text).toBe("New heading");
    expect(paras[0].runs[0].bold).toBe(true);
    expect(paras[1].runs[0].text).toBe("Second line");

    // Title shape untouched.
    const title = parseShapeText(edited, "2");
    expect(title[0].runs[0].text).toBe("Q3 Sales Report");

    // Picture still present.
    const shapes = parseSlideShapes(edited);
    expect(shapes.find((s) => s.id === "4")?.type).toBe("image");
  });

  it("throws for missing shape", () => {
    expect(() =>
      setShapeText(SAMPLE_SLIDE, "999", [{ runs: [{ text: "x" }] }])
    ).toThrow("not found");
  });

  it("escapes user text inserted into XML", () => {
    const edited = setShapeText(SAMPLE_SLIDE, "3", [
      { runs: [{ text: `A <B> & "C"` }] },
    ]);
    expect(edited).toContain("A &lt;B&gt; &amp;");
    // And it parses back to the original text.
    const paras = parseShapeText(edited, "3");
    expect(paras[0].runs[0].text).toBe(`A <B> & "C"`);
  });
});
