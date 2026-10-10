/**
 * Slug helpers for skills. A skill's slug is its stable, model-facing
 * identifier: it appears in the `<skills>` catalog, is passed to the
 * `load_skill` tool, is typed after `/` to invoke, and becomes the directory
 * name in an exported skill pack (per the Agent Skills spec).
 */

const MAX_SLUG = 64;

/** Kebab-case identifier derived from a display name. Never empty. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  return base || "skill";
}

/** Return `base`, or `base-2`, `base-3`, … until it is not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
