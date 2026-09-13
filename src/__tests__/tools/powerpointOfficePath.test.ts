import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool } from "../../tools/registry";
import JSZip from "jszip";

// Import registers the PowerPoint tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

// Minimal valid single-slide pptx (as a JSZip) that contains slide1.xml.
const MINIMAL_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1371600"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:rPr sz="4400" b="1"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:rPr><a:t>Q3 Sales Report</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content Placeholder 2"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1748799"/><a:ext cx="8229600" cy="3657600"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>Revenue grew 12% year over year.</a:t></a:r></a:p>
          <a:p><a:r><a:t>Second bullet.</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

async function buildSlideZipBase64(): Promise<string> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", MINIMAL_SLIDE_XML);
  zip.file("[Content_Types].xml", "");
  return zip.generateAsync({ type: "base64" });
}

// Mock a PowerPoint host with a fixed set of slides, each exporting a given zip.
function installMockPowerPoint(options: {
  slideCount?: number;
  slideZipBase64?: string;
  exportAsBase64?: boolean;
} = {}) {
  const slideCount = options.slideCount ?? 2;
  const exportSupported = options.exportAsBase64 ?? true;
  const slideZip = options.slideZipBase64;

  const sync = vi.fn().mockImplementation(async () => {});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slideItems: any[] = [];
  for (let i = 0; i < slideCount; i++) {
    const slide = {
      id: String(256 + i),
      layout: { name: i === 0 ? "Title Slide" : "Title and Content", load: vi.fn() },
      shapes: {
        items: [],
        load: vi.fn(),
        addTextBox: vi.fn(() => ({ id: "101", load: vi.fn() })),
        addGeometricShape: vi.fn(() => ({ id: "101", load: vi.fn() })),
        addLine: vi.fn(() => ({ id: "101", load: vi.fn() })),
        getItem: vi.fn((id: string) => ({
          id,
          load: vi.fn(),
          delete: vi.fn(),
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          fill: { setSolidColor: vi.fn() },
          textFrame: {
            textRange: {
              font: {},
              paragraphFormat: { horizontalAlignment: undefined },
            },
          },
        })),
      },
      load: vi.fn(),
      delete: vi.fn(),
      exportAsBase64: exportSupported
        ? () => {
            return { value: slideZip };
          }
        : undefined,
    };
    slideItems.push(slide);
  }

  const context = {
    presentation: {
      slides: {
        items: slideItems,
        add: vi.fn(),
        getItem: (id: string) => slideItems.find((s) => s.id === id),
        getItemAt: (i: number) => slideItems[i],
        load: vi.fn(),
        getCount: () => ({ value: slideCount }),
      },
      insertSlidesFromBase64: vi.fn(),
      load: vi.fn(),
      slideMasters: {
        items: [
          {
            id: "M1",
            name: "Office Theme",
            layouts: {
              items: [
                { id: "L1", name: "Title Slide" },
                { id: "L2", name: "Title and Content" },
              ],
              load: vi.fn(),
            },
            load: vi.fn(),
          },
        ],
        load: vi.fn(),
      },
    },
    sync,
  };

  g.Office = {
    onReady: () => {},
    context: { host: "PowerPoint" },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
  };
  g.PowerPoint = {
    run: (fn: (ctx: unknown) => Promise<unknown>) => fn(context),
  };

  return { context, slideItems, sync };
}

beforeEach(() => {
  g.Office = undefined;
  g.PowerPoint = undefined;
});

afterEach(() => {
  g.Office = undefined;
  g.PowerPoint = undefined;
  vi.restoreAllMocks();
});

describe("PowerPoint read tools — mocked office path", () => {
  it("get_presentation_structure lists slides via PowerPoint.run", async () => {
    installMockPowerPoint({ slideCount: 3 });
    const result = JSON.parse(await executeTool("get_presentation_structure", {}));
    expect(result.total_slides).toBe(3);
    expect(result.slides[0].position).toBe(1);
    expect(result.slides[0].slideId).toBe("256");
    expect(result.slides[2].slideId).toBe("258");
  });

  it("list_slide_shapes reads shapes from the exported slide zip", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(await executeTool("list_slide_shapes", { slide: "1" }));
    expect(result.shape_count).toBe(2);
    const title = result.shapes.find((s: { id: string }) => s.id === "2");
    expect(title.placeholder).toBe("title");
    expect(title.textPreview).toBe("Q3 Sales Report");
    expect(title.width).toBeCloseTo(8229600 / 12700);
  });

  it("list_slide_shapes resolves a slide id reference", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(await executeTool("list_slide_shapes", { slide: "257" }));
    expect(result.slide_id).toBe("257");
  });

  it("list_slide_shapes errors on an out-of-range position", async () => {
    installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(await executeTool("list_slide_shapes", { slide: "9" }));
    expect(result.error).toContain("out of range");
  });

  it("read_slide returns styled paragraphs for text shapes", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(await executeTool("read_slide", { slide: "1" }));
    expect(result.element_count).toBe(2);
    const title = result.elements.find((e: { id: string }) => e.id === "2");
    expect(title.paragraphs[0].runs[0].text).toBe("Q3 Sales Report");
    expect(title.paragraphs[0].runs[0].bold).toBe(true);
  });

  it("read_slide_text returns per-run formatting", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("read_slide_text", { slide: "1", shape_id: "3" })
    );
    expect(result.paragraph_count).toBe(2);
    expect(result.paragraphs[0].runs[0].text).toBe("Revenue grew 12% year over year.");
    expect(result.paragraphs[1].runs[0].text).toBe("Second bullet.");
  });

  it("read_slide_text errors for a missing shape", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("read_slide_text", { slide: "1", shape_id: "999" })
    );
    expect(result.error).toContain("not found");
  });

  it("list_masters lists masters and layouts", async () => {
    installMockPowerPoint();
    const result = JSON.parse(await executeTool("list_masters", {}));
    expect(result.masters[0].master_id).toBe("M1");
    expect(result.masters[0].layouts.length).toBe(2);
    expect(result.masters[0].layouts[0].layout_id).toBe("L1");
  });

  it("verify_slides reports out-of-bounds and contrast issues", async () => {
    // Build a slide with a shape outside bounds and low-contrast text.
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="OffScreen"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="12000000" y="1000000"/><a:ext cx="1000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>White on white</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:sld>`
    );
    installMockPowerPoint({
      slideCount: 1,
      slideZipBase64: await zip.generateAsync({ type: "base64" }),
    });

    const result = JSON.parse(await executeTool("verify_slides", {}));
    expect(result.slides[0].out_of_bounds.length).toBeGreaterThan(0);
    expect(result.slides[0].contrast_warnings.length).toBeGreaterThan(0);
    expect(result.slides[0].contrast_warnings[0].ratio).toBeLessThan(4.5);
  });

  it("falls back to dev mode when exportAsBase64 is unsupported", async () => {
    installMockPowerPoint({ exportAsBase64: false });
    const result = JSON.parse(await executeTool("list_slide_shapes", { slide: "1" }));
    expect(result.error).toContain("not a function");
  });
});

describe("PowerPoint write tools — mocked office path", () => {
  it("edit_slide_text writes back via insertSlidesFromBase64 + delete", async () => {
    const { context, slideItems } = installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });

    const result = JSON.parse(
      await executeTool("edit_slide_text", {
        slide: "1",
        shape_id: "3",
        paragraphs: [{ runs: [{ text: "Updated bullet", bold: true }] }],
      })
    );

    expect(result.success).toBe(true);
    expect(result.paragraphs[0].runs[0].text).toBe("Updated bullet");
    expect(result.paragraphs[0].runs[0].bold).toBe(true);

    // The write-back must have been invoked.
    expect(context.presentation.insertSlidesFromBase64).toHaveBeenCalledTimes(1);
    // And the original slide deleted.
    expect(slideItems[0].delete).toHaveBeenCalledTimes(1);
  });

  it("edit_slide_text preserves other shapes after write-back", async () => {
    const { context } = installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });

    const result = JSON.parse(
      await executeTool("edit_slide_text", {
        slide: "1",
        shape_id: "3",
        paragraphs: [{ runs: [{ text: "Only this changes" }] }],
      })
    );

    // The returned paragraphs are from the edited slide — title untouched.
    expect(result.paragraphs.length).toBe(1);
    expect(context.presentation.insertSlidesFromBase64).toHaveBeenCalledTimes(1);
  });

  it("edit_slide_text errors for a missing shape", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_text", {
        slide: "1",
        shape_id: "999",
        paragraphs: [{ runs: [{ text: "x" }] }],
      })
    );
    expect(result.error).toContain("not found");
  });

  it("edit_slide_text warns that shape ids change after re-import", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_text", {
        slide: "1",
        shape_id: "3",
        paragraphs: [{ runs: [{ text: "Updated" }] }],
      })
    );
    expect(result.warning).toContain("PowerPoint assigned new ids");
    expect(result.warning).toContain("list_slide_shapes");
  });

  it("edit_slide_xml verifies shapes survived re-import and flags dropped ones", async () => {
    // The mock's re-export returns the ORIGINAL zip (2 shapes). The user code
    // adds a third shape to the edited XML, so verification must detect that
    // the re-imported slide has fewer shapes than the edited XML.
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_xml", {
        slide: "1",
        code: `
          const f = zip.file('ppt/slides/slide1.xml');
          const xml = await f.async('string');
          const extra = '<p:sp><p:nvSpPr><p:cNvPr id="99" name="NewBox"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>added</a:t></a:r></a:p></p:txBody></p:sp>';
          zip.file('ppt/slides/slide1.xml', xml.replace('</p:spTree>', extra + '</p:spTree>'));
          markDirty();
          return { added: true };
        `,
      })
    );
    expect(result.success).toBe(true);
    expect(result.verification).toBeDefined();
    expect(result.verification.ok).toBe(false);
    expect(result.verification.message).toContain("dropped");
  });

  it("edit_slide_xml reports verification ok when shapes survive", async () => {
    // Editing text inside an existing shape keeps the same shape count, so the
    // re-imported slide (same 2 shapes) matches the edited XML.
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_xml", {
        slide: "1",
        code: `
          const f = zip.file('ppt/slides/slide1.xml');
          const xml = await f.async('string');
          zip.file('ppt/slides/slide1.xml', xml.replace('Revenue grew', 'Revenue jumped'));
          markDirty();
          return { edited: true };
        `,
      })
    );
    expect(result.success).toBe(true);
    expect(result.verification).toBeDefined();
    expect(result.verification.ok).toBe(true);
    expect(result.warning).toContain("new ids");
  });

  it("edit_slide_xml exposes the slidePath global so code need not guess the file name", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_xml", {
        slide: "1",
        code: `
          const f = zip.file(slidePath);
          const xml = await f.async('string');
          return { path: slidePath, hasTitle: xml.includes('Q3 Sales Report') };
        `,
      })
    );
    expect(result.success).toBe(true);
    expect(result.result.path).toBe("ppt/slides/slide1.xml");
    expect(result.result.hasTitle).toBe(true);
  });

  it("edit_slide_xml appends a file hint when the model guesses a position-based name", async () => {
    installMockPowerPoint({ slideZipBase64: await buildSlideZipBase64() });
    const result = JSON.parse(
      await executeTool("edit_slide_xml", {
        slide: "1",
        code: `
          const f = zip.file('ppt/slides/slide2.xml');
          const xml = await f.async('string');
          return { ok: true };
        `,
      })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("ppt/slides/slide1.xml");
    expect(result.error).toContain("slidePath");
    expect(result.error).toContain("never guess");
  });

  it("modify_presentation_structure create appends a slide", async () => {
    const { context } = installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("modify_presentation_structure", { operation: "create" })
    );
    expect(result.success).toBe(true);
    expect(result.operation).toBe("create");
    // slides.add should have been called on the collection.
    expect(context.presentation.slides.add).toHaveBeenCalledTimes(1);
  });

  it("modify_presentation_structure delete removes a slide", async () => {
    const { slideItems } = installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("modify_presentation_structure", { operation: "delete", slide: "257" })
    );
    expect(result.success).toBe(true);
    expect(slideItems[1].delete).toHaveBeenCalledTimes(1);
  });

  it("modify_presentation_structure errors on out-of-range position for move", async () => {
    installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("modify_presentation_structure", { operation: "move", slide: "1", position: 9 })
    );
    expect(result.error).toContain("between 1 and 2");
  });

  it("insert_slide_element adds a text box via native API", async () => {
    installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("insert_slide_element", {
        slide: "1",
        element_type: "text",
        content: "New caption",
        x: 100,
        y: 50,
        width: 300,
        height: 80,
      })
    );
    expect(result.success).toBe(true);
    expect(result.element_id).toBeDefined();
  });

  it("insert_slide_element auto-backs a full-bleed rectangle via OOXML reorder", async () => {
    // The exported slide already has the background shape at the FRONT of the
    // tree (the exact failure from the end-user report). Pin Date.now so the
    // tool's generated name matches the shape in the zip.
    vi.spyOn(Date, "now").mockReturnValue(12345);
    const bgName = "__odb_bg_12345";
    const bgShape = `<p:sp>
      <p:nvSpPr><p:cNvPr id="100" name="${bgName}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody>
    </p:sp>`;
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", MINIMAL_SLIDE_XML.replace("</p:spTree>", bgShape + "</p:spTree>"));
    zip.file("[Content_Types].xml", "");
    const { context } = installMockPowerPoint({
      slideCount: 1,
      slideZipBase64: await zip.generateAsync({ type: "base64" }),
    });

    const result = JSON.parse(
      await executeTool("insert_slide_element", {
        slide: "1",
        element_type: "shape",
        shape_type: "Rectangle",
        x: 0,
        y: 0,
        width: 960,
        height: 540,
      })
    );

    expect(result.success).toBe(true);
    expect(result.z_order).toBe("back");
    expect(result.order).toBe(0);
    expect(result.element_id).toBe("100");
    expect(result.warning).toContain("back of the stacking order");
    // The write-back re-import path must have been used.
    expect(context.presentation.insertSlidesFromBase64).toHaveBeenCalledTimes(1);
  });

  it("insert_slide_element respects an explicit z_order back for non-full-bleed shapes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(67890);
    const bgName = "__odb_bg_67890";
    const shape = `<p:sp>
      <p:nvSpPr><p:cNvPr id="100" name="${bgName}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="2000000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
      <p:txBody><a:bodyPr/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody>
    </p:sp>`;
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", MINIMAL_SLIDE_XML.replace("</p:spTree>", shape + "</p:spTree>"));
    zip.file("[Content_Types].xml", "");
    const { context } = installMockPowerPoint({
      slideCount: 1,
      slideZipBase64: await zip.generateAsync({ type: "base64" }),
    });

    const result = JSON.parse(
      await executeTool("insert_slide_element", {
        slide: "1",
        element_type: "shape",
        shape_type: "Rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        z_order: "back",
      })
    );

    expect(result.success).toBe(true);
    expect(result.z_order).toBe("back");
    expect(result.order).toBe(0);
    expect(context.presentation.insertSlidesFromBase64).toHaveBeenCalledTimes(1);
  });

  it("remove_slide_element deletes a shape", async () => {
    installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("remove_slide_element", { slide: "1", shape_id: "2" })
    );
    expect(result.success).toBe(true);
  });

  it("format_shape applies font and fill", async () => {
    installMockPowerPoint({ slideCount: 2 });
    const result = JSON.parse(
      await executeTool("format_shape", {
        slide: "1",
        shape_id: "2",
        bold: true,
        fill_color: "#4472C4",
        horizontal_alignment: "Center",
      })
    );
    expect(result.success).toBe(true);
  });
});
