import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "../../../chat/skills/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Concise Answers")).toBe("concise-answers");
  });

  it("strips diacritics and symbols", () => {
    expect(slugify("Revisión de contratos!")).toBe("revision-de-contratos");
  });

  it("collapses repeated separators and trims hyphens", () => {
    expect(slugify("  --A   B--  ")).toBe("a-b");
  });

  it("caps the length", () => {
    expect(slugify("x".repeat(200)).length).toBe(64);
  });

  it("falls back to 'skill'", () => {
    expect(slugify("!!!")).toBe("skill");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("alpha", ["beta"])).toBe("alpha");
  });

  it("appends -2, -3 on collision", () => {
    expect(uniqueSlug("alpha", ["alpha"])).toBe("alpha-2");
    expect(uniqueSlug("alpha", ["alpha", "alpha-2"])).toBe("alpha-3");
  });
});
