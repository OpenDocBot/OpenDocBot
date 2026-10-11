import { describe, it, expect } from "vitest";
import { truncateChars, sanitizeLoneSurrogates } from "../../lib/text";

const hasLoneSurrogate = (s: string): boolean =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe("truncateChars", () => {
  it("returns the string unchanged when within the limit", () => {
    expect(truncateChars("hello", 10)).toBe("hello");
  });

  it("truncates and appends an ellipsis", () => {
    expect(truncateChars("hello world", 5)).toBe("hello…");
  });

  it("does not split a surrogate pair at the cut", () => {
    // The flag emoji straddles the 30th code point, the exact shape that
    // produced a lone high surrogate and broke the provider's JSON parser.
    const s = "Fuente: Notion · HQ Cracovia 🇵🇱 · https://example.com";
    const out = truncateChars(s, 30);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out.endsWith("…")).toBe(true);
  });

  it("counts astral characters as one code point", () => {
    expect(truncateChars("🇵🇱🇵🇱", 1)).toBe("🇵…");
  });

  it("supports a custom ellipsis, including none", () => {
    expect(truncateChars("abcdef", 3, "")).toBe("abc");
    expect(truncateChars("abcdef", 3, "...")).toBe("abc...");
  });
});

describe("sanitizeLoneSurrogates", () => {
  it("leaves well-formed text untouched", () => {
    expect(sanitizeLoneSurrogates("plain text 🇵🇱 ok")).toBe("plain text 🇵🇱 ok");
  });

  it("replaces a lone high surrogate", () => {
    expect(sanitizeLoneSurrogates("a\uD83Cb")).toBe("a\uFFFDb");
  });

  it("replaces a lone low surrogate", () => {
    expect(sanitizeLoneSurrogates("a\uDDF5b")).toBe("a\uFFFDb");
  });

  it("keeps valid surrogate pairs", () => {
    expect(sanitizeLoneSurrogates("a\uD83C\uDDF5b")).toBe("a\uD83C\uDDF5b");
  });
});
