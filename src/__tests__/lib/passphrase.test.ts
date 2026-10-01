import { describe, it, expect } from "vitest";
import {
  generatePassphrase,
  isUsablePassphrase,
  passphraseStrength,
} from "../../lib/passphrase";

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe("passphrase — generatePassphrase", () => {
  it("produces a URL-safe, unpadded base64url string", () => {
    const pass = generatePassphrase();
    expect(pass).toMatch(BASE64URL_RE);
    expect(pass).not.toContain("=");
    expect(pass).not.toContain("+");
    expect(pass).not.toContain("/");
  });

  it("defaults to 24 bytes (32 base64url chars)", () => {
    expect(generatePassphrase()).toHaveLength(32);
  });

  it("honors a custom byte length", () => {
    expect(generatePassphrase(12)).toHaveLength(16);
    expect(generatePassphrase(6)).toHaveLength(8);
  });

  it("does not repeat across calls", () => {
    const values = new Set(Array.from({ length: 50 }, () => generatePassphrase()));
    expect(values.size).toBe(50);
  });

  it("is usable", () => {
    expect(isUsablePassphrase(generatePassphrase())).toBe(true);
  });
});

describe("passphrase — isUsablePassphrase", () => {
  it("rejects empty and whitespace-only values", () => {
    expect(isUsablePassphrase("")).toBe(false);
    expect(isUsablePassphrase("   ")).toBe(false);
    expect(isUsablePassphrase("\n\t")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isUsablePassphrase(undefined)).toBe(false);
    expect(isUsablePassphrase(null)).toBe(false);
    expect(isUsablePassphrase(123)).toBe(false);
  });

  it("accepts any non-empty string", () => {
    expect(isUsablePassphrase("a")).toBe(true);
    expect(isUsablePassphrase("  spaced  ")).toBe(true);
  });
});

describe("passphrase — passphraseStrength", () => {
  it("is weak for empty/short passphrases", () => {
    expect(passphraseStrength("")).toBe("weak");
    expect(passphraseStrength("short")).toBe("weak");
    expect(passphraseStrength("a".repeat(11))).toBe("weak");
  });

  it("is ok for medium passphrases", () => {
    expect(passphraseStrength("a".repeat(12))).toBe("ok");
    expect(passphraseStrength("a".repeat(23))).toBe("ok");
  });

  it("is strong for long passphrases", () => {
    expect(passphraseStrength("a".repeat(24))).toBe("strong");
    expect(passphraseStrength(generatePassphrase())).toBe("strong");
  });
});
