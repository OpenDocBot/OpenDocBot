import { describe, it, expect, beforeEach } from "vitest";
import { executeTool } from "../../tools/registry";

// Import registers the PowerPoint tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

beforeEach(() => {
  g.Office = undefined;
  g.PowerPoint = undefined;
});

describe("PowerPoint tools — dev mode", () => {
  it("get_presentation_structure returns sample deck", async () => {
    const result = JSON.parse(await executeTool("get_presentation_structure", {}));
    expect(result.total_slides).toBeGreaterThan(0);
    expect(result.slides[0]).toHaveProperty("position");
    expect(result.slides[0]).toHaveProperty("slideId");
    expect(result.slides[0]).toHaveProperty("title");
  });

  it("list_slide_shapes returns sample shapes", async () => {
    const result = JSON.parse(await executeTool("list_slide_shapes", { slide: "1" }));
    expect(result.shape_count).toBeGreaterThan(0);
    expect(result.shapes[0]).toHaveProperty("id");
    expect(result.shapes[0]).toHaveProperty("textPreview");
  });

  it("list_slide_shapes errors without slide", async () => {
    const result = JSON.parse(await executeTool("list_slide_shapes", {}));
    expect(result.error).toContain("slide is required");
  });

  it("read_slide returns styled paragraphs per element", async () => {
    const result = JSON.parse(await executeTool("read_slide", { slide: "1" }));
    expect(result.element_count).toBeGreaterThan(0);
    const textEl = result.elements.find((e: { paragraphs?: unknown[] }) => e.paragraphs);
    expect(textEl).toBeDefined();
  });

  it("read_slide_text returns paragraphs with run formatting", async () => {
    const result = JSON.parse(
      await executeTool("read_slide_text", { slide: "1", shape_id: "2" })
    );
    expect(result.paragraph_count).toBeGreaterThan(0);
    expect(result.paragraphs[0].runs[0]).toHaveProperty("text");
  });

  it("read_slide_text errors without shape_id", async () => {
    const result = JSON.parse(await executeTool("read_slide_text", { slide: "1" }));
    expect(result.error).toContain("slide and shape_id are required");
  });

  it("list_masters returns masters with layouts", async () => {
    const result = JSON.parse(await executeTool("list_masters", {}));
    expect(result.masters.length).toBeGreaterThan(0);
    expect(result.masters[0].layouts[0]).toHaveProperty("layout_id");
  });

  it("verify_slides returns geometry checks", async () => {
    const result = JSON.parse(await executeTool("verify_slides", {}));
    expect(result.slides.length).toBeGreaterThan(0);
    expect(result.slides[0]).toHaveProperty("overlaps");
    expect(result.slides[0]).toHaveProperty("out_of_bounds");
    expect(result.slides[0]).toHaveProperty("contrast_warnings");
  });
});

describe("PowerPoint write tools — dev mode", () => {
  it("modify_presentation_structure create/delete/duplicate/move succeed", async () => {
    for (const operation of ["create", "delete", "duplicate", "move"]) {
      const result = JSON.parse(
        await executeTool("modify_presentation_structure", {
          operation,
          ...(operation === "move" ? { slide: "1", position: 2 } : { slide: "1" }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.operation).toBe(operation);
    }
  });

  it("modify_presentation_structure errors without operation", async () => {
    const result = JSON.parse(await executeTool("modify_presentation_structure", {}));
    expect(result.error).toContain("operation is required");
  });

  it("insert_slide_element succeeds for text, shape, and line", async () => {
    const text = JSON.parse(
      await executeTool("insert_slide_element", { slide: "1", element_type: "text", content: "Hello" })
    );
    expect(text.success).toBe(true);

    const shape = JSON.parse(
      await executeTool("insert_slide_element", { slide: "1", element_type: "shape", shape_type: "Rectangle" })
    );
    expect(shape.success).toBe(true);

    const line = JSON.parse(
      await executeTool("insert_slide_element", { slide: "1", element_type: "line" })
    );
    expect(line.success).toBe(true);
  });

  it("insert_slide_element errors without element_type", async () => {
    const result = JSON.parse(await executeTool("insert_slide_element", { slide: "1" }));
    expect(result.error).toContain("slide and element_type are required");
  });

  it("remove_slide_element succeeds and errors without shape_id", async () => {
    const ok = JSON.parse(await executeTool("remove_slide_element", { slide: "1", shape_id: "2" }));
    expect(ok.success).toBe(true);

    const err = JSON.parse(await executeTool("remove_slide_element", { slide: "1" }));
    expect(err.error).toContain("slide and shape_id are required");
  });

  it("edit_slide_text replaces paragraphs", async () => {
    const result = JSON.parse(
      await executeTool("edit_slide_text", {
        slide: "1",
        shape_id: "2",
        paragraphs: [{ runs: [{ text: "New title", bold: true }] }],
      })
    );
    expect(result.success).toBe(true);
    expect(result.paragraphs[0].runs[0].text).toBe("New title");
  });

  it("edit_slide_text errors without paragraphs", async () => {
    const result = JSON.parse(await executeTool("edit_slide_text", { slide: "1", shape_id: "2" }));
    expect(result.error).toContain("paragraphs are required");
  });

  it("edit_slide_xml runs code against the slide zip", async () => {
    const result = JSON.parse(
      await executeTool("edit_slide_xml", {
        slide: "1",
        code: `const f = zip.file('ppt/slides/slide1.xml'); const xml = await f.async('string'); return { len: xml.length };`,
      })
    );
    expect(result.success).toBe(true);
  });

  it("format_shape succeeds and errors without shape_id", async () => {
    const ok = JSON.parse(
      await executeTool("format_shape", { slide: "1", shape_id: "2", bold: true })
    );
    expect(ok.success).toBe(true);

    const err = JSON.parse(await executeTool("format_shape", { slide: "1" }));
    expect(err.error).toContain("slide and shape_id are required");
  });
});
