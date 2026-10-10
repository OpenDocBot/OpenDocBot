import type { Skill } from "./types";

export interface SkillInvocation {
  skill: Skill;
  /** Text typed after the `/slug` command (may be empty). */
  rest: string;
}

const INVOCATION_RE = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i;

/**
 * Parse a leading `/slug` command (optionally followed by arguments) and
 * resolve it against the given skills. Returns null when the text is not a
 * slash invocation or no skill matches.
 */
export function parseSkillInvocation(text: string, skills: Skill[]): SkillInvocation | null {
  const match = INVOCATION_RE.exec(text.trim());
  if (!match) return null;
  const slug = match[1].toLowerCase();
  const skill = skills.find((s) => s.slug.toLowerCase() === slug);
  if (!skill) return null;
  return { skill, rest: (match[2] ?? "").trim() };
}
