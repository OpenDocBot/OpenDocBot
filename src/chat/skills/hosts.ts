import type { Host } from "../../office";

/** Single-letter badge for each host (used in the menu and the editor). */
export const HOST_SHORT: Record<Host, string> = {
  word: "W",
  excel: "X",
  powerpoint: "P",
};

/** Full host name (tooltips, labels). */
export const HOST_LABEL: Record<Host, string> = {
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
};

/** Ordered host options for selectors. */
export const HOST_OPTIONS: { value: Host; label: string }[] = [
  { value: "word", label: HOST_LABEL.word },
  { value: "excel", label: HOST_LABEL.excel },
  { value: "powerpoint", label: HOST_LABEL.powerpoint },
];
