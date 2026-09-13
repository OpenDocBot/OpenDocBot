import { describe, it, expect } from "vitest";
import { formatAttachments } from "../../chat/attachments/prompt";
import { MAX_TEXT_CHARS_TOTAL } from "../../chat/attachments/config";
import type { Attachment } from "../../chat/types";

function att(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "1",
    name: "file.txt",
    mime: "text/plain",
    size: 10,
    kind: "text",
    status: "ready",
    text: "hello",
    ...overrides,
  };
}

describe("formatAttachments", () => {
  it("returns empty when there is nothing ready", () => {
    expect(formatAttachments(undefined)).toBe("");
    expect(formatAttachments([att({ status: "extracting", text: undefined })])).toBe("");
    expect(formatAttachments([att({ status: "error", text: undefined })])).toBe("");
  });

  it("renders a ready attachment as an attached_file block", () => {
    const out = formatAttachments([att({ name: "notes.md", kind: "text", text: "# Hi" })]);
    expect(out).toContain('<attached_file name="notes.md" type="text">');
    expect(out).toContain("# Hi");
    expect(out).toContain("</attached_file>");
  });

  it("includes metadata and truncation flag", () => {
    const out = formatAttachments([
      att({ kind: "pdf", name: "scan.pdf", meta: { pages: 12 }, text: "body" }),
      att({ id: "2", kind: "sheet", name: "s.xlsx", meta: { sheets: 3 }, text: "t", truncated: true }),
    ]);
    expect(out).toContain('pages="12"');
    expect(out).toContain('sheets="3"');
    expect(out).toContain('truncated="true"');
  });

  it("escapes quotes in file names", () => {
    const out = formatAttachments([att({ name: 'a"b.txt' })]);
    expect(out).toContain('name="a&quot;b.txt"');
    expect(out).not.toContain('name="a"b.txt"');
  });

  it("enforces the total character budget", () => {
    const big = "x".repeat(MAX_TEXT_CHARS_TOTAL + 1000);
    const out = formatAttachments([att({ text: big })]);
    const body = out.slice(out.indexOf("\n") + 1, out.lastIndexOf("\n</attached_file>"));
    expect(body.length).toBeLessThanOrEqual(MAX_TEXT_CHARS_TOTAL);
    expect(out).toContain('truncated="true"');
  });
});
