import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_ACCEPT,
  detectKind,
  formatBytes,
  getExtension,
  isLegacyOffice,
  mimeForFilename,
} from "../../chat/attachments/config";

describe("attachment config", () => {
  it("extracts extensions case-insensitively", () => {
    expect(getExtension("Report.DOCX")).toBe("docx");
    expect(getExtension("noext")).toBe("");
  });

  it("detects kinds", () => {
    expect(detectKind("notes.txt")).toBe("text");
    expect(detectKind("data.json")).toBe("text");
    expect(detectKind("paper.pdf")).toBe("pdf");
    expect(detectKind("report.docx")).toBe("word");
    expect(detectKind("deck.pptx")).toBe("slides");
    expect(detectKind("sheet.xlsx")).toBe("sheet");
    expect(detectKind("doc.odt")).toBe("word");
    expect(detectKind("sheet.ods")).toBe("sheet");
    expect(detectKind("deck.odp")).toBe("slides");
    expect(detectKind("notes.rtf")).toBe("rtf");
  });

  it("marks legacy and unknown types unsupported", () => {
    expect(detectKind("old.doc")).toBe("unsupported");
    expect(detectKind("old.ppt")).toBe("unsupported");
    expect(detectKind("old.xls")).toBe("unsupported");
    expect(detectKind("archive.zip")).toBe("unsupported");
    expect(isLegacyOffice("old.doc")).toBe(true);
    expect(isLegacyOffice("new.docx")).toBe(false);
  });

  it("maps mime types", () => {
    expect(mimeForFilename("a.pdf")).toBe("application/pdf");
    expect(mimeForFilename("a.docx")).toContain("wordprocessingml");
    expect(mimeForFilename("a.unknownext", "fallback/x")).toBe("fallback/x");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("builds an accept attribute covering supported extensions", () => {
    expect(ATTACHMENT_ACCEPT).toContain(".pdf");
    expect(ATTACHMENT_ACCEPT).toContain(".docx");
    expect(ATTACHMENT_ACCEPT).toContain(".txt");
    expect(ATTACHMENT_ACCEPT).not.toContain(".doc,");
  });
});
