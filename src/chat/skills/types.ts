import type { Host } from "../../office";
import { slugify } from "./slug";

/** Every Office host a skill can target. */
export const ALL_HOSTS: Host[] = ["word", "excel", "powerpoint"];

/**
 * A user-authored skill, following the Agent Skills model: a skill's metadata
 * (name + description) is advertised in the system prompt when it applies to the
 * current Office host, and its full instructions are loaded on demand (by the
 * model via the `load_skill` tool, or by the user typing `/slug`).
 *
 * Skills are *content*, not provider configuration, so they live in their own
 * persisted store (`src/store/skillsStore.ts`) and travel as `SKILL.md`
 * (see `./transfer`).
 */
export interface Skill {
  /** Internal id. */
  id: string;
  /** Display name shown in the menu. */
  name: string;
  /** Stable kebab-case identifier (catalog, `load_skill`, `/`, export dir). */
  slug: string;
  /** Required: what the skill does and when to use it (activation hint). */
  description: string;
  /** The instructions loaded when the skill is activated. */
  instructions: string;
  /** Office hosts the skill is available in (at least one). */
  hosts: Host[];
}

export function createSkill(
  name: string,
  description: string,
  instructions: string,
  hosts: Host[] = [...ALL_HOSTS],
): Skill {
  const trimmed = name.trim();
  return {
    id: crypto.randomUUID(),
    name: trimmed,
    slug: slugify(trimmed),
    description: description.trim(),
    instructions,
    hosts: hosts.length > 0 ? [...hosts] : [...ALL_HOSTS],
  };
}
