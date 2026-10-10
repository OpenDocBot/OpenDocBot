import type { Skill } from "./types";

export const SKILLS_NOTE =
  "Skills are loaded on demand. When a request matches one of the skills above, " +
  "call `load_skill` with its name to load the full instructions, then follow them.";

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render the metadata of the enabled skills (slug + description) as the body of
 * the `<skills>` block. Bodies are deliberately NOT included: the model loads
 * them on demand via the `load_skill` tool. Returns "" when there is nothing to
 * advertise, keeping the system prompt byte-stable.
 *
 * Injected via `appendCustomInstructions` (tag `"skills"`), which wraps the body
 * in `<skills>…</skills>`.
 */
export function buildSkillsCatalog(skills?: Skill[]): string {
  const active = (skills ?? []).filter(
    (s) => s.description.trim().length > 0 || s.instructions.trim().length > 0,
  );
  if (active.length === 0) return "";

  return active
    .map(
      (s) =>
        `<skill name="${escapeText(s.slug)}">${escapeText(s.description.trim() || s.name)}</skill>`,
    )
    .join("\n");
}
