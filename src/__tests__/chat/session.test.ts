import { describe, it, expect, beforeEach } from "vitest";
import {
  setAbortController,
  setApprovalResolver,
  resolvePendingApproval,
  stopGeneration,
  getRejectedThisTurn,
  setRejectedThisTurn,
  resetSession,
} from "../../chat/session";

beforeEach(() => {
  resetSession();
});

describe("session — approval resolver", () => {
  it("resolves a registered approval with true", () => {
    let resolved: boolean | undefined;
    setApprovalResolver((approved) => { resolved = approved; });
    expect(resolvePendingApproval(true)).toBe(true);
    expect(resolved).toBe(true);
  });

  it("resolves a registered approval with false and marks the turn rejected", () => {
    let resolved: boolean | undefined;
    setApprovalResolver((approved) => { resolved = approved; });
    expect(resolvePendingApproval(false)).toBe(true);
    expect(resolved).toBe(false);
    expect(getRejectedThisTurn()).toBe(true);
  });

  it("returns false and does nothing when no approval is pending", () => {
    expect(resolvePendingApproval(true)).toBe(false);
    expect(getRejectedThisTurn()).toBe(false);
  });
});

describe("session — rejected this turn", () => {
  it("starts unset and can be set/reset", () => {
    expect(getRejectedThisTurn()).toBe(false);
    setRejectedThisTurn(true);
    expect(getRejectedThisTurn()).toBe(true);
    setRejectedThisTurn(false);
    expect(getRejectedThisTurn()).toBe(false);
  });
});

describe("session — stopGeneration", () => {
  it("aborts the registered controller", () => {
    let aborted = false;
    const controller = new AbortController();
    controller.signal.addEventListener("abort", () => { aborted = true; });
    setAbortController(controller);
    stopGeneration();
    expect(aborted).toBe(true);
  });

  it("rejects a pending approval with false and clears the resolver", () => {
    let resolved: boolean | undefined;
    setApprovalResolver((approved) => { resolved = approved; });
    stopGeneration();
    expect(resolved).toBe(false);
    // A second resolve is now a no-op (resolver cleared).
    expect(resolvePendingApproval(true)).toBe(false);
  });

  it("is a safe no-op when nothing is running", () => {
    expect(() => stopGeneration()).not.toThrow();
  });
});

describe("session — resetSession", () => {
  it("clears controller, resolver, and rejected flag", () => {
    setAbortController(new AbortController());
    setApprovalResolver(() => {});
    setRejectedThisTurn(true);
    resetSession();
    expect(getRejectedThisTurn()).toBe(false);
    expect(resolvePendingApproval(true)).toBe(false);
    expect(() => stopGeneration()).not.toThrow();
  });
});