import { describe, it, expect, vi, beforeEach } from "vitest";

const parseOffice = vi.fn(async () => ({
  to: vi.fn(async () => ({ value: "## Report\n\nHello" })),
}));

vi.mock("officeparser", () => ({
  OfficeParser: { parseOffice },
}));

let pdfPageText = "Some extracted page text";
const getDocument = vi.fn((_input?: unknown) => ({
  promise: Promise.resolve({
    numPages: 2,
    getPage: async () => ({
      getTextContent: async () => ({
        items: [{ str: pdfPageText, hasEOL: true }],
      }),
      cleanup: () => {},
    }),
  }),
  destroy: async () => {},
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (input: unknown) => getDocument(input),
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "pdf.worker.mjs",
}));

import { extractFile } from "../../chat/attachments/extract";
import { MAX_TEXT_CHARS_PER_FILE, SCANNED_PDF_MIN_CHARS } from "../../chat/attachments/config";

function file(name: string, content: string, type = ""): File {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    type,
    text: async () => content,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

beforeEach(() => {
  vi.clearAllMocks();
  pdfPageText = "Some extracted page text";
});

describe("extractFile", () => {
  it("decodes text files directly", async () => {
    const out = await extractFile(file("notes.md", "# Hello\r\n\r\nworld", "text/markdown"));
    expect(out.text).toBe("# Hello\n\nworld");
    expect(out.scanned).toBe(false);
    expect(out.truncated).toBe(false);
    expect(parseOffice).not.toHaveBeenCalled();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("truncates text past the per-file cap", async () => {
    const out = await extractFile(file("big.txt", "x".repeat(MAX_TEXT_CHARS_PER_FILE + 500)));
    expect(out.truncated).toBe(true);
    expect(out.text).toHaveLength(MAX_TEXT_CHARS_PER_FILE);
  });

  it("parses office files via officeparser (not pdfjs)", async () => {
    const out = await extractFile(file("report.docx", "binary", "application/octet-stream"));
    expect(out.text).toBe("## Report\n\nHello");
    expect(parseOffice).toHaveBeenCalledTimes(1);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("parses PDFs via pdfjs and reports metadata", async () => {
    pdfPageText = "y".repeat(SCANNED_PDF_MIN_CHARS + 10);
    const out = await extractFile(file("doc.pdf", "pdf", "application/pdf"));
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(out.meta?.pages).toBe(2);
    expect(out.scanned).toBe(false);
    expect(parseOffice).not.toHaveBeenCalled();
  });

  it("flags image-only PDFs as scanned", async () => {
    pdfPageText = "";
    const out = await extractFile(file("scan.pdf", "pdf", "application/pdf"));
    expect(out.scanned).toBe(true);
  });

  it("rejects legacy and unsupported files", async () => {
    await expect(extractFile(file("old.doc", "x"))).rejects.toThrow(/Legacy Office/);
    await expect(extractFile(file("archive.zip", "x"))).rejects.toThrow(/Unsupported/);
  });
});
