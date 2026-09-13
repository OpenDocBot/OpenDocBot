/** Keeps the original `File` for each queued attachment so OCR can re-read it. */
const files = new Map<string, File>();

export const attachmentFileCache = {
  set(id: string, file: File): void {
    files.set(id, file);
  },
  get(id: string): File | undefined {
    return files.get(id);
  },
  delete(id: string): void {
    files.delete(id);
  },
  clear(): void {
    files.clear();
  },
};
