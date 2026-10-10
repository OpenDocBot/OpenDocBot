import { describe, it, expect } from "vitest";
import { parseSkillInvocation } from "../../../chat/skills/invoke";
import type { Skill } from "../../../chat/skills/types";

const alpha: Skill = {
  id: "a",
  name: "Alpha",
  slug: "alpha",
  description: "Alpha skill",
  instructions: "Do alpha.",
  hosts: ["word", "excel", "powerpoint"],
};
const skills = [alpha];

describe("parseSkillInvocation", () => {
  it("parses `/slug` with trailing arguments", () => {
    expect(parseSkillInvocation("/alpha summarize this", skills)).toEqual({
      skill: alpha,
      rest: "summarize this",
    });
  });

  it("parses `/slug` alone", () => {
    expect(parseSkillInvocation("/alpha", skills)).toEqual({ skill: alpha, rest: "" });
  });

  it("is case-insensitive", () => {
    expect(parseSkillInvocation("/ALPHA go", skills)?.skill).toBe(alpha);
  });

  it("returns null for plain text", () => {
    expect(parseSkillInvocation("hello", skills)).toBeNull();
  });

  it("returns null for an unknown slug", () => {
    expect(parseSkillInvocation("/nope go", skills)).toBeNull();
  });

  it("returns null when the slash is not at the start", () => {
    expect(parseSkillInvocation("do /alpha", skills)).toBeNull();
  });
});
