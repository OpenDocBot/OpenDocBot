import { describe, it, expect } from "vitest";
import {
  serializeSkillMd,
  parseSkillMd,
  parseSkillsJson,
  exportSkillsZip,
  parseSkillsZip,
  parseSkillsFile,
  SKILLS_FORMAT,
} from "../../../chat/skills/transfer";
import type { Skill } from "../../../chat/skills/types";

const alpha: Skill = {
  id: "a",
  name: "Alpha",
  slug: "alpha",
  description: "first skill",
  instructions: "Do alpha.",
  hosts: ["word", "excel", "powerpoint"],
};

describe("SKILL.md", () => {
  it("round-trips a skill", () => {
    const md = serializeSkillMd(alpha);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: alpha");
    expect(md).toContain("description: first skill");
    expect(md).toContain("  display-name: Alpha");

    const parsed = parseSkillMd(md);
    expect(parsed).toMatchObject({
      name: "Alpha",
      slug: "alpha",
      description: "first skill",
      instructions: "Do alpha.",
    });
  });

  it("quotes scalars that need it", () => {
    const parsed = parseSkillMd(serializeSkillMd({ ...alpha, description: "a: b # c" }));
    expect(parsed?.description).toBe("a: b # c");
  });

  it("returns null for non-skill text or an empty body", () => {
    expect(parseSkillMd("hello")).toBeNull();
    expect(parseSkillMd("---\nname: x\n---\n")).toBeNull();
  });

  it("falls back to the slug for the display name", () => {
    const parsed = parseSkillMd("---\nname: my-skill\ndescription: d\n---\nbody");
    expect(parsed?.name).toBe("my-skill");
    expect(parsed?.slug).toBe("my-skill");
  });

  it("round-trips a host-scoped skill via metadata.hosts", () => {
    const md = serializeSkillMd({ ...alpha, hosts: ["word", "excel"] });
    expect(md).toContain("hosts: word,excel");
    expect(parseSkillMd(md)?.hosts).toEqual(["word", "excel"]);
  });

  it("always writes metadata.hosts, even for every host", () => {
    const md = serializeSkillMd(alpha);
    expect(md).toContain("hosts: word,excel,powerpoint");
    expect(parseSkillMd(md)?.hosts).toEqual(["word", "excel", "powerpoint"]);
  });
});

describe("legacy JSON", () => {
  it("parses a bundle and backfills slug + description", () => {
    const text = JSON.stringify({
      format: SKILLS_FORMAT,
      version: 1,
      skills: [{ id: "a", name: "Alpha", instructions: "Do alpha." }],
    });
    expect(parseSkillsJson(text)[0]).toMatchObject({
      id: "a",
      name: "Alpha",
      slug: "alpha",
      description: "Alpha",
      instructions: "Do alpha.",
    });
  });

  it("throws on an unrelated object", () => {
    expect(() => parseSkillsJson('{"format":"other"}')).toThrow();
  });
});

describe("zip pack", () => {
  it("round-trips a library", async () => {
    const blob = await exportSkillsZip([alpha, { ...alpha, id: "b", name: "Beta", slug: "beta" }]);
    const out = await parseSkillsZip(blob);
    expect(out.map((s) => s.slug).sort()).toEqual(["alpha", "beta"]);
    expect(out.find((s) => s.slug === "alpha")?.instructions).toBe("Do alpha.");
  });

  it("preserves hosts through the zip", async () => {
    const blob = await exportSkillsZip([{ ...alpha, hosts: ["word"] }]);
    expect((await parseSkillsZip(blob))[0].hosts).toEqual(["word"]);
  });
});

describe("parseSkillsFile", () => {
  function textFile(name: string, text: string): File {
    const file = new File([text], name);
    Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
    return file;
  }

  it("parses a single SKILL.md", async () => {
    const file = textFile("SKILL.md", serializeSkillMd(alpha));
    expect((await parseSkillsFile(file))[0].slug).toBe("alpha");
  });

  it("parses a legacy JSON file", async () => {
    const file = textFile("skills.json", JSON.stringify([alpha]));
    expect((await parseSkillsFile(file))[0].slug).toBe("alpha");
  });

  it("parses a zip pack", async () => {
    const blob = await exportSkillsZip([alpha]);
    const file = new File([blob], "skills.zip");
    expect((await parseSkillsFile(file))[0].slug).toBe("alpha");
  });

  it("throws on unrecognized content", async () => {
    await expect(parseSkillsFile(textFile("nope.txt", "garbage"))).rejects.toThrow();
  });
});
