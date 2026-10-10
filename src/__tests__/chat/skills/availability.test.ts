import { describe, it, expect } from "vitest";
import { availableSkills, isSkillAvailable, normalizeHosts } from "../../../chat/skills/availability";
import type { Skill } from "../../../chat/skills/types";

const word: Skill = {
  id: "a",
  name: "Word only",
  slug: "word-only",
  description: "d",
  instructions: "i",
  hosts: ["word"],
};
const excel: Skill = { ...word, id: "b", slug: "excel-only", hosts: ["excel"] };

describe("skill availability", () => {
  it("isSkillAvailable checks the host", () => {
    expect(isSkillAvailable(word, "word")).toBe(true);
    expect(isSkillAvailable(word, "excel")).toBe(false);
  });

  it("availableSkills filters by host", () => {
    expect(availableSkills([word, excel], "word")).toEqual([word]);
    expect(availableSkills([word, excel], "powerpoint")).toEqual([]);
  });
});

describe("normalizeHosts", () => {
  it("keeps valid hosts from an array, deduped", () => {
    expect(normalizeHosts(["word", "word", "excel"])).toEqual(["word", "excel"]);
  });

  it("parses a comma/space separated string", () => {
    expect(normalizeHosts("word, excel")).toEqual(["word", "excel"]);
    expect(normalizeHosts("word excel")).toEqual(["word", "excel"]);
  });

  it("defaults to every host when nothing valid is given", () => {
    expect(normalizeHosts(undefined)).toEqual(["word", "excel", "powerpoint"]);
    expect(normalizeHosts(["bogus"])).toEqual(["word", "excel", "powerpoint"]);
  });
});
