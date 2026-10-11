/**
 * Text helpers that are safe for the UTF-16 surrogate pairs used by emoji and
 * other astral characters.
 */

/**
 * Truncate a string to at most `max` Unicode code points, appending `ellipsis`
 * only when something was removed.
 *
 * Code-point aware, so it never splits a surrogate pair. A plain
 * `s.slice(0, n)` can leave a lone surrogate at the cut, and JSON.stringify
 * then emits it as a `\uXXXX` escape that strict parsers (serde_json) reject
 * with "unexpected end of hex escape".
 */
export function truncateChars(s: string, max: number, ellipsis = "…"): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") + ellipsis : s;
}

/**
 * Replace lone (unpaired) UTF-16 surrogates with U+FFFD.
 *
 * Safety net for strings sent to a provider: JSON.stringify escapes lone
 * surrogates as `\uXXXX`, which strict JSON parsers reject. Matching a valid
 * pair first (two code units) means only genuinely unpaired surrogates are
 * replaced.
 */
export function sanitizeLoneSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) =>
    match.length === 2 ? match : "\uFFFD",
  );
}
