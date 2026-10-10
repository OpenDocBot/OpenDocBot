import { describe, it, expect } from "vitest";
import { buildSkillsCatalog, SKILLS_NOTE } from "../../../chat/skills/prompt";
import type { Skill } from "../../../chat/skills/types";

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "s1",
    name: "Concise answers",
    slug: "concise-answers",
    description: "Short answers for busy readers.",
    instructions: "Be concise.",
    hosts: ["word", "excel", "powerpoint"],
    ...overrides,
  };
}

describe("buildSkillsCatalog", () => {
  it("returns an empty string when there are no skills", () => {
    expect(buildSkillsCatalog()).toBe("");
    expect(buildSkillsCatalog([])).toBe("");
  });

  it("renders one <skill> per skill with slug and description", () => {
    const catalog = buildSkillsCatalog([
      skill(),
      skill({ id: "s2", name: "Formal", slug: "formal", description: "Formal tone." }),
    ]);
    expect(catalog).toContain('<skill name="concise-answers">Short answers for busy readers.</skill>');
    expect(catalog).toContain('<skill name="formal">Formal tone.</skill>');
  });

  it("does not include the skill body", () => {
    expect(buildSkillsCatalog([skill()])).not.toContain("Be concise.");
  });

  it("falls back to the name when the description is empty", () => {
    const catalog = buildSkillsCatalog([skill({ description: "" })]);
    expect(catalog).toContain("Concise answers");
  });

  it("escapes special characters", () => {
    const catalog = buildSkillsCatalog([skill({ description: "a < b & c" })]);
    expect(catalog).toContain("a &lt; b &amp; c");
  });

  it("exposes a non-empty note", () => {
    expect(SKILLS_NOTE.length).toBeGreaterThan(0);
    expect(SKILLS_NOTE).toContain("load_skill");
  });
});
