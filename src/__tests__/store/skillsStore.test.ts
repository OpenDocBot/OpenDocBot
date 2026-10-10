import { describe, it, expect, beforeEach } from "vitest";
import { useSkillsStore } from "../../store/skillsStore";
import { MAX_SKILLS } from "../../chat/skills/config";
import type { Skill } from "../../chat/skills/types";

const skill = (id: string, name = id, slug = name): Skill => ({
  id,
  name,
  slug,
  description: `${name} skill`,
  instructions: `do ${id}`,
  hosts: ["word", "excel", "powerpoint"],
});

beforeEach(() => {
  useSkillsStore.setState({ skills: [] });
});

describe("skillsStore", () => {
  it("adds a skill", () => {
    useSkillsStore.getState().addSkill(skill("a", "Alpha", "alpha"));
    expect(useSkillsStore.getState().skills).toHaveLength(1);
  });

  it("keeps slugs unique", () => {
    useSkillsStore.getState().addSkill(skill("a", "Alpha", "alpha"));
    useSkillsStore.getState().addSkill(skill("b", "Alpha", "alpha"));
    expect(useSkillsStore.getState().skills.map((s) => s.slug)).toEqual(["alpha", "alpha-2"]);
  });

  it("recomputes the slug when the name changes", () => {
    useSkillsStore.getState().addSkill(skill("a", "Alpha", "alpha"));
    useSkillsStore.getState().updateSkill("a", { name: "Beta" });
    expect(useSkillsStore.getState().skills[0].slug).toBe("beta");
  });

  it("removes a skill", () => {
    useSkillsStore.getState().addSkill(skill("a", "Alpha", "alpha"));
    useSkillsStore.getState().addSkill(skill("b", "Beta", "beta"));
    useSkillsStore.getState().removeSkill("a");
    expect(useSkillsStore.getState().skills.map((s) => s.id)).toEqual(["b"]);
  });

  it("caps the library size", () => {
    for (let i = 0; i < MAX_SKILLS + 5; i++) {
      useSkillsStore.getState().addSkill(skill(`s${i}`, `Skill ${i}`, `skill-${i}`));
    }
    expect(useSkillsStore.getState().skills.length).toBe(MAX_SKILLS);
  });

  it("migrates a v1 snapshot (backfills slug + description + hosts)", async () => {
    localStorage.setItem(
      "opendocbot-skills",
      JSON.stringify({
        state: { skills: [{ id: "a", name: "Alpha", instructions: "Do alpha." }] },
        version: 1,
      }),
    );
    await useSkillsStore.persist.rehydrate();
    expect(useSkillsStore.getState().skills[0]).toMatchObject({
      id: "a",
      name: "Alpha",
      slug: "alpha",
      description: "Alpha",
      instructions: "Do alpha.",
      hosts: ["word", "excel", "powerpoint"],
    });
    localStorage.removeItem("opendocbot-skills");
  });

  it("migrates a v2 snapshot (backfills hosts only)", async () => {
    localStorage.setItem(
      "opendocbot-skills",
      JSON.stringify({
        state: {
          skills: [
            { id: "a", name: "Alpha", slug: "alpha", description: "d", instructions: "Do alpha." },
          ],
        },
        version: 2,
      }),
    );
    await useSkillsStore.persist.rehydrate();
    expect(useSkillsStore.getState().skills[0].hosts).toEqual(["word", "excel", "powerpoint"]);
    localStorage.removeItem("opendocbot-skills");
  });

  it("importSkills upserts by slug and keeps the existing id", () => {
    useSkillsStore.getState().addSkill(skill("a", "Alpha", "alpha"));
    useSkillsStore.getState().importSkills([
      { ...skill("new", "Alpha v2", "alpha"), instructions: "updated" },
      skill("c", "Gamma", "gamma"),
    ]);
    const bySlug = Object.fromEntries(
      useSkillsStore.getState().skills.map((s) => [s.slug, s]),
    );
    expect(Object.keys(bySlug).sort()).toEqual(["alpha", "gamma"]);
    expect(bySlug.alpha.id).toBe("a");
    expect(bySlug.alpha.instructions).toBe("updated");
  });
});
