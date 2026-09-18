import { describe, it, expect } from "vitest";
import {
  parseRangeAddress,
  resolveWorksheet,
  normalizeColumnRef,
  normalizeRowRef,
  columnLetter,
  columnCharsToPoints,
  columnPointsToChars,
} from "../../tools/excel/shared";

describe("parseRangeAddress", () => {
  it("returns input unchanged for a plain address", () => {
    expect(parseRangeAddress("A1:C5")).toEqual({ address: "A1:C5" });
  });

  it("splits a plain sheet qualifier", () => {
    expect(parseRangeAddress("Sheet1!A1:C5")).toEqual({
      sheetName: "Sheet1",
      address: "A1:C5",
    });
  });

  it("splits a quoted sheet name", () => {
    expect(parseRangeAddress("'My Sheet'!B2:D10")).toEqual({
      sheetName: "My Sheet",
      address: "B2:D10",
    });
  });

  it("splits a single-cell qualified reference", () => {
    expect(parseRangeAddress("Hoja1!A1")).toEqual({
      sheetName: "Hoja1",
      address: "A1",
    });
  });

  it("handles empty input", () => {
    expect(parseRangeAddress("")).toEqual({ address: "" });
  });

  it("treats a bare column reference without sheet as plain", () => {
    expect(parseRangeAddress("A:C")).toEqual({ address: "A:C" });
  });

  it("splits a sheet-qualified whole-column reference", () => {
    expect(parseRangeAddress("Sheet1!A:A")).toEqual({
      sheetName: "Sheet1",
      address: "A:A",
    });
  });

  it("handles sheet names with digits and underscores", () => {
    expect(parseRangeAddress("Hoja_2!A1")).toEqual({
      sheetName: "Hoja_2",
      address: "A1",
    });
  });

  it("splits only the first sheet qualifier", () => {
    expect(parseRangeAddress("Sheet1!Data!A1")).toEqual({
      sheetName: "Sheet1",
      address: "Data!A1",
    });
  });

  it("leaves absolute references without a sheet as plain", () => {
    expect(parseRangeAddress("$A$1")).toEqual({ address: "$A$1" });
  });

  it("keeps whitespace as-is (no trimming)", () => {
    expect(parseRangeAddress(" A1:C5")).toEqual({ address: " A1:C5" });
  });

  it("splits a case-sensitive sheet name unchanged", () => {
    expect(parseRangeAddress("SalesData!B2")).toEqual({
      sheetName: "SalesData",
      address: "B2",
    });
  });
});

describe("resolveWorksheet", () => {
  function mockSheet(name: string, isNull = false) {
    return {
      name,
      load: () => {},
      isNullObject: isNull,
    };
  }

  function makeContext(activeName: string, available: string[]) {
    const getItemOrNullObject = (target: string) =>
      mockSheet(target, !available.includes(target));

    const worksheets = {
      getActiveWorksheet: () => mockSheet(activeName),
      getItemOrNullObject,
      items: available.map((n) => mockSheet(n)),
      load: () => {},
    };

    return {
      workbook: { worksheets },
      sync: () => Promise.resolve(),
    } as unknown as Excel.RequestContext;
  }

  it("returns active worksheet when no name given", async () => {
    const ctx = makeContext("Sheet1", ["Sheet1"]);
    const result = await resolveWorksheet(ctx);
    expect(result.worksheet.name).toBe("Sheet1");
    expect(result.warning).toBeUndefined();
  });

  it("returns exact match for an existing sheet", async () => {
    const ctx = makeContext("Sheet1", ["Sheet1", "Data"]);
    const result = await resolveWorksheet(ctx, "Data");
    expect(result.worksheet.name).toBe("Data");
    expect(result.warning).toBeUndefined();
  });

  it("falls back to active worksheet with warning for a missing sheet", async () => {
    const ctx = makeContext("Sheet1", ["Sheet1", "Data"]);
    const result = await resolveWorksheet(ctx, "Nope");
    expect(result.worksheet.name).toBe("Sheet1");
    expect(result.warning).toContain('Worksheet "Nope" not found');
    expect(result.warning).toContain("used active worksheet \"Sheet1\"");
    expect(result.warning).toContain("Available worksheets: [Sheet1, Data]");
  });
});

describe("normalizeColumnRef", () => {
  it("expands a bare letter to a whole-column range", () => {
    expect(normalizeColumnRef("A")).toBe("A:A");
  });

  it("uppercases a lowercase bare letter", () => {
    expect(normalizeColumnRef("b")).toBe("B:B");
  });

  it("leaves a multi-column range untouched", () => {
    expect(normalizeColumnRef("A:C")).toBe("A:C");
  });

  it("leaves a full column reference untouched", () => {
    expect(normalizeColumnRef("A:A")).toBe("A:A");
  });

  it("handles empty input", () => {
    expect(normalizeColumnRef("")).toBe("");
  });

  it("trims surrounding whitespace from a bare letter", () => {
    expect(normalizeColumnRef("  b ")).toBe("B:B");
  });

  it("trims surrounding whitespace from a multi-column range", () => {
    expect(normalizeColumnRef(" A:C ")).toBe(" A:C ");
  });
});

describe("normalizeRowRef", () => {
  it("expands a bare row number to a whole-row range", () => {
    expect(normalizeRowRef("3")).toBe("3:3");
  });

  it("leaves a multi-row range untouched", () => {
    expect(normalizeRowRef("3:5")).toBe("3:5");
  });

  it("leaves a full row reference untouched", () => {
    expect(normalizeRowRef("1:1")).toBe("1:1");
  });

  it("handles empty input", () => {
    expect(normalizeRowRef("")).toBe("");
  });

  it("trims surrounding whitespace from a bare row number", () => {
    expect(normalizeRowRef("  3 ")).toBe("3:3");
  });

  it("trims surrounding whitespace from a multi-row range", () => {
    expect(normalizeRowRef(" 3:5 ")).toBe(" 3:5 ");
  });
});

describe("columnLetter", () => {
  it("maps single-letter columns", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
  });

  it("maps double-letter columns", () => {
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(51)).toBe("AZ");
  });

  it("maps higher columns", () => {
    expect(columnLetter(52)).toBe("BA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });
});

describe("column width unit conversion", () => {
  it("converts the Excel default width (8.43 chars = 48 pt)", () => {
    expect(columnCharsToPoints(8.43)).toBeCloseTo(48, 1);
    expect(columnPointsToChars(48)).toBeCloseTo(8.43, 2);
  });

  it("round-trips characters through points", () => {
    for (const chars of [5, 12, 20, 40, 100]) {
      expect(columnPointsToChars(columnCharsToPoints(chars))).toBeCloseTo(chars, 6);
    }
  });

  it("never yields a negative width", () => {
    expect(columnPointsToChars(0)).toBe(0);
    expect(columnPointsToChars(-10)).toBe(0);
  });
});
