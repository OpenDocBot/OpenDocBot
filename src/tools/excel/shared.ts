/**
 * Shared helpers for Excel tools: resilient worksheet resolution and
 * A1-address parsing. Kept pure/testable where possible.
 */

export interface ResolvedWorksheet {
  worksheet: Excel.Worksheet;
  warning?: string;
}

export interface ParsedAddress {
  sheetName?: string;
  address: string;
}

/**
 * Split an A1 reference into an optional sheet qualifier and the local
 * address. Handles quoted sheet names ("'My Sheet'!A1:C3") and plain ones
 * ("Sheet1!A1:C3"). Returns the input unchanged when no qualifier is present.
 */
export function parseRangeAddress(address: string): ParsedAddress {
  if (!address) return { address };
  const match = /^(?:'([^']+)'|([^!]+))!/.exec(address);
  if (!match) return { address };
  return {
    sheetName: match[1] ?? match[2],
    address: address.slice(match[0].length),
  };
}

/**
 * Resolve the worksheet to operate on.
 *
 * - No sheet name  → active worksheet.
 * - Sheet name     → exact match; falls back (case-insensitively) to the
 *   active worksheet when not found, with a `warning` explaining the fallback
 *   and listing the available worksheets so the model can self-correct.
 *
 * Uses `getItemOrNullObject` so a missing sheet never poisons the context.
 */
export async function resolveWorksheet(
  context: Excel.RequestContext,
  sheetName?: string
): Promise<ResolvedWorksheet> {
  if (!sheetName) {
    return { worksheet: context.workbook.worksheets.getActiveWorksheet() };
  }

  const candidate = context.workbook.worksheets.getItemOrNullObject(sheetName);
  candidate.load("isNullObject");
  await context.sync();

  if (!candidate.isNullObject) {
    return { worksheet: candidate };
  }

  const all = context.workbook.worksheets;
  all.load("items/name");
  await context.sync();
  const names = all.items.map((w) => w.name);

  const active = context.workbook.worksheets.getActiveWorksheet();
  active.load("name");
  await context.sync();

  return {
    worksheet: active,
    warning:
      `Worksheet "${sheetName}" not found — used active worksheet "${active.name}". ` +
      `Available worksheets: [${names.join(", ")}].`,
  };
}

/** Load `name` on a worksheet so it can be read after the next sync. */
export function loadWorksheetName(worksheet: Excel.Worksheet): void {
  worksheet.load("name");
}

/** Convert a 0-based column index to its Excel column letters (0 -> "A", 25 -> "Z", 26 -> "AA"). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/**
 * Normalize a column reference for `worksheet.getRange()`. Excel.js needs a
 * whole-column reference to be "A:A", but callers often pass just "A".
 * Leaves multi-column ranges ("A:C") untouched.
 */
export function normalizeColumnRef(ref: string): string {
  if (!ref) return ref;
  const trimmed = ref.trim();
  if (/^[A-Za-z]+$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}:${trimmed.toUpperCase()}`;
  }
  return ref;
}

/**
 * Normalize a row reference for `worksheet.getRange()`. Excel.js needs a
 * whole-row reference to be "1:1", but callers often pass just "1".
 * Leaves multi-row ranges ("1:3") untouched.
 */
export function normalizeRowRef(ref: string): string {
  if (!ref) return ref;
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}:${trimmed}`;
  }
  return ref;
}
