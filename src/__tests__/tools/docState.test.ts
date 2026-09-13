import { describe, it, expect } from "vitest";
import { buildParagraphMarker, type DocParagraph } from "../../tools/docState";

function para(overrides: Partial<DocParagraph>): DocParagraph {
  return {
    text: "Hello world",
    styleBuiltIn: undefined,
    outlineLevel: 0,
    isListItem: false,
    listString: undefined,
    hasInlinePicture: false,
    hasPageBreak: false,
    hasPageBreakBefore: false,
    index: 0,
    ...overrides,
  };
}

describe("buildParagraphMarker", () => {
  it("returns empty string for a plain Normal paragraph", () => {
    expect(buildParagraphMarker(para({}))).toBe("");
  });

  it("marks a manual page break character", () => {
    expect(buildParagraphMarker(para({ hasPageBreak: true }))).toBe("[page-break] ");
  });

  it("marks the pageBreakBefore property", () => {
    expect(buildParagraphMarker(para({ hasPageBreakBefore: true }))).toBe("[page-break-before] ");
  });

  it("marks both kinds of page break together", () => {
    expect(buildParagraphMarker(para({ hasPageBreak: true, hasPageBreakBefore: true }))).toBe(
      "[page-break] [page-break-before] "
    );
  });

  it("marks built-in heading styles", () => {
    expect(buildParagraphMarker(para({ styleBuiltIn: "Heading1" }))).toBe("[Heading1] ");
  });

  it("does not mark Normal or Other styles", () => {
    expect(buildParagraphMarker(para({ styleBuiltIn: "Normal" }))).toBe("");
    expect(buildParagraphMarker(para({ styleBuiltIn: "Other" }))).toBe("");
  });

  it("marks list items with their rendered list string", () => {
    expect(buildParagraphMarker(para({ isListItem: true, listString: "1." }))).toBe("[1.] ");
  });

  it("marks inline pictures", () => {
    expect(buildParagraphMarker(para({ hasInlinePicture: true }))).toBe("[img] ");
  });

  it("combines multiple markers in order", () => {
    const p = para({
      styleBuiltIn: "Heading1",
      isListItem: true,
      listString: "1.",
      hasInlinePicture: true,
      hasPageBreakBefore: true,
    });
    expect(buildParagraphMarker(p)).toBe("[Heading1] [1.] [page-break-before] [img] ");
  });

  it("prefers an explicit style argument over the paragraph style", () => {
    const p = para({ styleBuiltIn: "Heading1" });
    expect(buildParagraphMarker(p, "Heading2")).toBe("[Heading2] ");
  });
});
