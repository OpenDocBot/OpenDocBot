import { describe, it, expect, vi } from "vitest";
import { isInsideOffice, getHost } from "../office";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe("isInsideOffice", () => {
  it("returns false when Office is not defined", () => {
    delete g.Office;
    expect(isInsideOffice()).toBe(false);
  });

  it("returns false when Office.context is not defined", () => {
    g.Office = { onReady: vi.fn() };
    expect(isInsideOffice()).toBe(false);
    delete g.Office;
  });

  it("returns false when Office.context.host is not defined", () => {
    g.Office = { onReady: vi.fn(), context: {} };
    expect(isInsideOffice()).toBe(false);
    delete g.Office;
  });

  it("returns true when inside Office host (e.g. Word)", () => {
    g.Office = { onReady: vi.fn(), context: { host: "Word" } };
    expect(isInsideOffice()).toBe(true);
    delete g.Office;
  });
});

describe("getHost", () => {
  it("defaults to word when not inside Office", () => {
    delete g.Office;
    expect(getHost()).toBe("word");
  });

  it("returns word when host is Word", () => {
    g.Office = { onReady: vi.fn(), context: { host: "Word" }, HostType: { Word: "Word", Excel: "Excel" } };
    expect(getHost()).toBe("word");
    delete g.Office;
  });

  it("returns excel when host is Excel", () => {
    g.Office = { onReady: vi.fn(), context: { host: "Excel" }, HostType: { Word: "Word", Excel: "Excel" } };
    expect(getHost()).toBe("excel");
    delete g.Office;
  });

  it("returns powerpoint when host is PowerPoint", () => {
    g.Office = {
      onReady: vi.fn(),
      context: { host: "PowerPoint" },
      HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
    };
    expect(getHost()).toBe("powerpoint");
    delete g.Office;
  });
});
