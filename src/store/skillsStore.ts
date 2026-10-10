import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Skill } from "../chat/skills/types";
import { MAX_SKILLS } from "../chat/skills/config";
import { slugify, uniqueSlug } from "../chat/skills/slug";
import { normalizeHosts } from "../chat/skills/availability";

interface SkillsState {
  /** The persisted skills library. */
  skills: Skill[];
  addSkill: (skill: Skill) => void;
  updateSkill: (id: string, patch: Partial<Omit<Skill, "id">>) => void;
  removeSkill: (id: string) => void;
  /**
   * Upsert imported skills by slug (used by library import). Existing skills not
   * present in `incoming` are kept; matched skills keep their id.
   */
  importSkills: (skills: Skill[]) => void;
}

/**
 * Backfill fields added after v1: `slug` + required `description` (v2) and
 * `hosts` (v3). Idempotent, so it is safe for any pre-v3 snapshot.
 */
function migrateSkills(raw: unknown): Skill[] {
  if (!Array.isArray(raw)) return [];
  const out: Skill[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : crypto.randomUUID(),
      name,
      slug: uniqueSlug(
        slugify(typeof r.slug === "string" && r.slug ? r.slug : name),
        out.map((s) => s.slug),
      ),
      description: (typeof r.description === "string" ? r.description.trim() : "") || name,
      instructions: typeof r.instructions === "string" ? r.instructions : "",
      hosts: normalizeHosts(r.hosts),
    });
  }
  return out;
}

export const useSkillsStore = create<SkillsState>()(
  persist(
    (set) => ({
      skills: [],

      addSkill: (skill) =>
        set((s) => {
          if (s.skills.length >= MAX_SKILLS) return s;
          const slug = uniqueSlug(
            skill.slug || slugify(skill.name),
            s.skills.map((x) => x.slug),
          );
          return { skills: [...s.skills, { ...skill, slug }] };
        }),

      updateSkill: (id, patch) =>
        set((s) => {
          const target = s.skills.find((skill) => skill.id === id);
          if (!target) return s;
          const merged = { ...target, ...patch, id };
          if (patch.name !== undefined) {
            merged.slug = uniqueSlug(
              slugify(merged.name),
              s.skills.filter((skill) => skill.id !== id).map((skill) => skill.slug),
            );
          }
          return { skills: s.skills.map((skill) => (skill.id === id ? merged : skill)) };
        }),

      removeSkill: (id) =>
        set((s) => ({ skills: s.skills.filter((skill) => skill.id !== id) })),

      importSkills: (incoming) =>
        set((s) => {
          const skills = s.skills.map((skill) => ({ ...skill }));
          for (const inc of incoming) {
            const idx = skills.findIndex((skill) => skill.slug === inc.slug);
            if (idx >= 0) {
              skills[idx] = { ...inc, id: skills[idx].id, slug: skills[idx].slug };
            } else {
              const slug = uniqueSlug(
                inc.slug || slugify(inc.name),
                skills.map((x) => x.slug),
              );
              skills.push({ ...inc, slug });
            }
          }
          return { skills: skills.slice(0, MAX_SKILLS) };
        }),
    }),
    {
      name: "opendocbot-skills",
      version: 3,
      partialize: (state) => ({ skills: state.skills }),
      migrate: (persisted, version) => {
        const state = persisted as { skills?: unknown } | undefined;
        if (version >= 3 || !state) return persisted;
        return { ...state, skills: migrateSkills(state.skills) };
      },
    },
  ),
);
