import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSuggestion,
  getSuggestion,
  removeSuggestion,
  clearSuggestions,
} from "../../chat/suggestionRegistry";

beforeEach(() => clearSuggestions());

describe("suggestionRegistry", () => {
  it("registers and reads a suggestion", () => {
    registerSuggestion("a", { host: "word", anchor: "passage", text: "t", createdAt: 1 });
    expect(getSuggestion("a")?.host).toBe("word");
    expect(getSuggestion("a")?.anchor).toBe("passage");
  });

  it("ignores empty ids", () => {
    registerSuggestion("", { host: "word", text: "t", createdAt: 1 });
    expect(getSuggestion("")).toBeUndefined();
  });

  it("removes a single suggestion", () => {
    registerSuggestion("a", {
      host: "excel",
      sheet: "S",
      cell: "B4",
      text: "t",
      createdAt: 1,
    });
    removeSuggestion("a");
    expect(getSuggestion("a")).toBeUndefined();
  });

  it("clears all suggestions", () => {
    registerSuggestion("a", { host: "word", text: "t", createdAt: 1 });
    registerSuggestion("b", { host: "excel", sheet: "S", text: "t", createdAt: 2 });
    clearSuggestions();
    expect(getSuggestion("a")).toBeUndefined();
    expect(getSuggestion("b")).toBeUndefined();
  });
});
