import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSessionId, resetSessionId } from "../../lib/chatSession";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
});

describe("chatSession", () => {
  it("returns a stable id within a session", () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
    expect(a).toMatch(UUID_RE);
  });

  it("persists the id in localStorage", () => {
    const id = getSessionId();
    expect(localStorage.getItem("opendocbot-session-id")).toBe(id);
  });

  it("resetSessionId clears storage", () => {
    getSessionId();
    resetSessionId();
    expect(localStorage.getItem("opendocbot-session-id")).toBeNull();
  });

  it("resetSessionId regenerates a new id", () => {
    const a = getSessionId();
    resetSessionId();
    const b = getSessionId();
    expect(b).not.toBe(a);
    expect(b).toMatch(UUID_RE);
  });

  it("falls back to an in-memory id when localStorage is unavailable", () => {
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    const id = getSessionId();
    expect(id).toMatch(UUID_RE);

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it("resetSessionId does not throw when localStorage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => resetSessionId()).not.toThrow();
    spy.mockRestore();
  });
});