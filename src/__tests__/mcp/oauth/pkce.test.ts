import { describe, it, expect } from "vitest";
import { createPkcePair, createState, randomString, toBase64Url } from "../../../mcp/oauth/pkce";

describe("pkce", () => {
  it("produces a challenge that is the S256 of the verifier", async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    expect(toBase64Url(digest)).toBe(challenge);
  });

  it("randomString is url-safe", () => {
    expect(randomString(16)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("createState is unique", () => {
    expect(createState()).not.toBe(createState());
  });
});
