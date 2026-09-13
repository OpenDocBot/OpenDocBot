import { describe, it, expect, vi, beforeEach } from "vitest";

const setParameters = vi.fn(async () => ({}));
const recognize = vi.fn(async () => ({ data: { text: "hola mundo", confidence: 88 } }));
const terminate = vi.fn(async () => ({}));
const createWorker = vi.fn(async () => ({ setParameters, recognize, terminate }));

vi.mock("tesseract.js", () => ({ createWorker }));
vi.mock("tesseract.js/dist/worker.min.js?url", () => ({ default: "worker.js" }));

const getViewport = vi.fn(({ scale }: { scale: number }) => ({
  width: 612 * scale,
  height: 792 * scale,
}));
const render = vi.fn(() => ({ promise: Promise.resolve() }));
const cleanup = vi.fn();
const getPage = vi.fn(async () => ({ getViewport, render, cleanup }));
const destroy = vi.fn(async () => {});
const getDocument = vi.fn((_input?: unknown) => ({
  promise: Promise.resolve({ numPages: 2, getPage }),
  destroy,
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (input: unknown) => getDocument(input),
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "pdf.worker.mjs" }));

import { ocrPdf } from "../../chat/attachments/extract";

function file(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    text: async () => content,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ocrPdf", () => {
  it("renders at ~300 DPI and tells Tesseract the DPI", async () => {
    await ocrPdf(file("scan.pdf", "%PDF-1.7"));
    expect(getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(getViewport).toHaveBeenCalledWith({ scale: 300 / 72 });
    expect(setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        user_defined_dpi: "300",
        preserve_interword_spaces: "1",
      })
    );
  });

  it("creates the worker with the configured language", async () => {
    await ocrPdf(file("scan.pdf", "%PDF"), { language: "spa" });
    expect(createWorker).toHaveBeenCalledWith(
      "spa",
      undefined,
      expect.objectContaining({ workerBlobURL: false })
    );
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it("returns extracted text, page count, and mean confidence", async () => {
    const out = await ocrPdf(file("scan.pdf", "%PDF"));
    expect(out.text).toContain("hola mundo");
    expect(out.scanned).toBe(false);
    expect(out.confidence).toBe(88);
    expect(out.meta?.pages).toBe(2);
  });

  it("terminates the worker and destroys the document", async () => {
    await ocrPdf(file("scan.pdf", "%PDF"));
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
