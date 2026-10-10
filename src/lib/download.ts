/** Trigger a client-side download of a blob. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a client-side download of a text file. */
export function downloadTextFile(name: string, text: string): void {
  downloadBlob(name, new Blob([text], { type: "text/plain" }));
}
