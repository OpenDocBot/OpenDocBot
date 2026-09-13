import { describe, it, expect } from "vitest";
import { analyzeSlide } from "../../tools/powerpoint/verifySlides";

function buildSlide(shapes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      ${shapes}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

function rectShape(
  id: string,
  name: string,
  left: number,
  top: number,
  width: number,
  height: number,
  fill?: string
): string {
  return `<p:sp>
    <p:nvSpPr>
      <p:cNvPr id="${id}" name="${name}"/>
      <p:cNvSpPr/>
      <p:nvPr/>
    </p:nvSpPr>
    <p:spPr>
      <a:xfrm>
        <a:off x="${Math.round(left * 12700)}" y="${Math.round(top * 12700)}"/>
        <a:ext cx="${Math.round(width * 12700)}" cy="${Math.round(height * 12700)}"/>
      </a:xfrm>
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      ${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : ""}
    </p:spPr>
    <p:txBody><a:bodyPr/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody>
  </p:sp>`;
}

describe("analyzeSlide — full-bleed backgrounds", () => {
  it("does not flag a full-bleed background overlapping content shapes", () => {
    const xml = buildSlide(
      rectShape("2", "Burgundy BG", 0, 0, 960, 540, "722F37") +
        rectShape("3", "Title", 80, 100, 600, 60) +
        rectShape("4", "Body", 80, 200, 700, 200)
    );
    const result = analyzeSlide(xml);
    expect(result.overlaps).toEqual([]);
    expect(result.z_order_warnings).toEqual([]);
  });

  it("flags a full-bleed background stacked in FRONT of content as a z-order bug", () => {
    const xml = buildSlide(
      rectShape("2", "Title", 80, 100, 600, 60) +
        rectShape("3", "Body", 80, 200, 700, 200) +
        rectShape("4", "Green BG", 0, 0, 960, 540, "0B1F15")
    );
    const result = analyzeSlide(xml);
    expect(result.overlaps).toEqual([]);
    expect(result.z_order_warnings.length).toBeGreaterThan(0);
    expect(result.z_order_warnings[0].shape_name).toBe("Green BG");
    expect(result.z_order_warnings[0].hidden_shape_name).toBe("Title");
    expect(result.z_order_warnings[0].msg).toContain("IN FRONT");
  });

  it("still flags genuine overlaps between content shapes", () => {
    const xml = buildSlide(
      rectShape("2", "Box A", 100, 100, 400, 200) +
        rectShape("3", "Box B", 300, 150, 400, 200)
    );
    const result = analyzeSlide(xml);
    expect(result.overlaps.length).toBeGreaterThan(0);
    expect(result.z_order_warnings).toEqual([]);
  });

  it("still reports out-of-bounds shapes even when full-bleed", () => {
    const xml = buildSlide(
      rectShape("2", "Oversized BG", 0, 0, 1200, 540)
    );
    const result = analyzeSlide(xml);
    expect(result.out_of_bounds.length).toBeGreaterThan(0);
  });
});