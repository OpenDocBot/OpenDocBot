import { describe, it, expect, beforeEach } from "vitest";
import "../../tools/skills/loadSkill";
import { executeTool } from "../../tools/registry";
import { useSkillsStore } from "../../store/skillsStore";
import type { Skill } from "../../chat/skills/types";

const alpha: Skill = {
  id: "a",
  name: "Alpha",
  slug: "alpha",
  description: "Alpha skill",
  instructions: "Do alpha.",
  hosts: ["word", "excel", "powerpoint"],
};

beforeEach(() => {
  useSkillsStore.setState({ skills: [alpha] });
});

describe("load_skill", () => {
  it("returns the body of a skill available in this host", async () => {
    const out = JSON.parse(await executeTool("load_skill", { name: "alpha" }));
    expect(out).toEqual({ name: "alpha", instructions: "Do alpha." });
  });

  it("is case-insensitive on the slug", async () => {
    const out = JSON.parse(await executeTool("load_skill", { name: "ALPHA" }));
    expect(out.instructions).toBe("Do alpha.");
  });

  it("errors for a skill not available in this host", async () => {
    useSkillsStore.setState({ skills: [{ ...alpha, hosts: ["excel"] }] });
    const out = JSON.parse(await executeTool("load_skill", { name: "alpha" }));
    expect(out.error).toContain("Unknown skill");
  });

  it("errors when name is missing", async () => {
    const out = JSON.parse(await executeTool("load_skill", {}));
    expect(out.error).toContain("name is required");
  });
});
