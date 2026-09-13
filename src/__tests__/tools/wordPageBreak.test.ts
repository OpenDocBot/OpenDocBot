import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeTool } from "../../tools/registry";

// Import registers the tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

interface StoreEntry {
  text: string;
  pbb: boolean;
  deleted: boolean;
}

/**
 * Install a Word host whose body contains the given paragraph texts.
 *
 * The mock models Word's real persistence + snapshot semantics:
 * - Each `Word.run` runs against a fresh context; `pageBreakBefore` set inside
 *   a run is visible in-context immediately, but only committed to the
 *   document store on sync when `persistPageBreakBefore` is true (Word for the
 *   web drops it, so with false it vanishes on the next run).
 * - `paragraphs.items` is a SNAPSHOT: `paragraphs.load("items")` + sync must be
 *   called to rebuild it. Crucially, after a STRUCTURAL edit (`insertBreak`,
 *   `delete`) within a run, re-loading `items` on the SAME collection no-ops —
 *   only a FRESH `Word.run` (fresh context) reflects the store. This is why
 *   verification after an edit must happen in a separate run.
 * - `insertBreak("Page", "Before")` inserts TWO paragraphs before the target:
 *   an empty artifact + the `\f` break (the observed Word-for-the-web shape).
 */
function installWordMock(paragraphTexts: string[], persistPageBreakBefore = true) {
  const store: StoreEntry[] = paragraphTexts.map((t) => ({ text: t, pbb: false, deleted: false }));
  const setPbb = (i: number, v: boolean) => {
    store[i].pbb = v;
  };

  g.Word = {
    run: (fn: (ctx: unknown) => Promise<unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let proxies: any[] = [];
      let reloadRequested = false;
      let structurallyModified = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function makeProxy(entry: StoreEntry): any {
        let pbb = entry.pbb;
        let dirty = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p: any = {
          text: entry.text,
          styleBuiltIn: "Normal",
          style: "",
          outlineLevel: 0,
          listItemOrNullObject: { isNullObject: true },
          inlinePictures: { items: [], load: vi.fn() },
          load: vi.fn(function (this: unknown) {
            return this;
          }),
          delete: vi.fn(() => {
            entry.deleted = true;
            structurallyModified = true;
          }),
          getRange: vi.fn(() => ({
            insertBreak: vi.fn(() => {
              const idx = proxies.indexOf(p);
              const emptyEntry: StoreEntry = { text: "", pbb: false, deleted: false };
              const breakEntry: StoreEntry = { text: "\f", pbb: false, deleted: false };
              // Mutate the STORE only — the current snapshot stays stale, and
              // re-loading items on THIS collection no-ops (structurallyModified)
              // until a fresh Word.run.
              store.splice(idx, 0, emptyEntry, breakEntry);
              structurallyModified = true;
            }),
          })),
          _commit: () => {
            if (dirty && persistPageBreakBefore) entry.pbb = pbb;
          },
        };
        Object.defineProperty(p, "pageBreakBefore", {
          get: () => pbb,
          set: (v: boolean) => {
            pbb = v;
            dirty = true;
          },
          configurable: true,
        });
        return p;
      }

      const sync = vi.fn(async () => {
        for (const p of proxies) p._commit();
        // Same-run reload after a structural edit is stale: only a fresh run
        // (structurallyModified starts false) rebuilds from the store.
        if (reloadRequested && !structurallyModified) {
          proxies = store.filter((e) => !e.deleted).map((entry) => makeProxy(entry));
          reloadRequested = false;
        }
      });

      proxies = store.filter((e) => !e.deleted).map((entry) => makeProxy(entry));

      const context = {
        document: {
          body: {
            paragraphs: {
              get items() {
                return proxies;
              },
              load: vi.fn(() => {
                reloadRequested = true;
              }),
            },
            tables: { items: [], load: vi.fn() },
          },
        },
        sync,
      };
      return fn(context);
    },
  };

  g.Office = {
    onReady: () => {},
    context: { host: "Word" },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
  };

  return { store, setPbb };
}

beforeEach(() => {
  g.Office = undefined;
  g.Word = undefined;
});

afterEach(() => {
  g.Office = undefined;
  g.Word = undefined;
});

describe("collapse_blank_paragraphs — page break preservation", () => {
  it("deletes blank runs but preserves paragraphs holding a manual \\f break", async () => {
    const { store } = installWordMock(["Title", "", "", "\f", "Intro"]);
    const result = JSON.parse(
      await executeTool("collapse_blank_paragraphs", { max_consecutive: 1 })
    );
    expect(result.deleted).toBe(1);
    expect(store[2].deleted).toBe(true);
    expect(store[3].deleted).toBe(false);
  });

  it("preserves paragraphs whose pageBreakBefore is set", async () => {
    const { store, setPbb } = installWordMock(["Title", "", "", "ToC", "Intro"]);
    setPbb(3, true);
    const result = JSON.parse(
      await executeTool("collapse_blank_paragraphs", { max_consecutive: 1 })
    );
    expect(result.deleted).toBe(1);
    expect(store[2].deleted).toBe(true);
    expect(store[3].deleted).toBe(false);
  });
});

describe("verify_doc — page break detection", () => {
  it("reports both pageBreakBefore and manual \\f breaks", async () => {
    const { setPbb } = installWordMock(["Title", "\f", "Intro"]);
    setPbb(2, true);
    const result = JSON.parse(await executeTool("verify_doc", {}));
    expect(result.page_break_before_paragraphs).toEqual([2]);
    expect(result.page_break_paragraphs).toEqual([1]);
  });
});

describe("read_doc_section — page break flag", () => {
  it("flags paragraphs containing a manual \\f break", async () => {
    installWordMock(["Title", "\f", "Intro"]);
    const result = JSON.parse(await executeTool("read_doc_section", {}));
    const p1 = result.paragraphs.find((p: { index: number }) => p.index === 1);
    expect(p1.contains_page_break).toBe(true);
    const p0 = result.paragraphs.find((p: { index: number }) => p.index === 0);
    expect(p0.contains_page_break).toBeUndefined();
  });
});

describe("set_page_break", () => {
  it("uses pageBreakBefore when the host persists it", async () => {
    installWordMock(["Title", "Subtitle", "", "Table of Contents", "Intro"], true);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "Table of Contents" })
    );
    expect(result.success).toBe(true);
    expect(result.method).toBe("pageBreakBefore");
    expect(result.paragraph).toBe(3);
    expect(result.verified).toBe(true);
  });

  it("falls back to a manual break when pageBreakBefore does not persist across contexts", async () => {
    installWordMock(["Title", "Subtitle", "", "Table of Contents", "Intro"], false);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "Table of Contents" })
    );
    expect(result.success).toBe(true);
    expect(result.method).toBe("manual");
    expect(result.verified).toBe(true);
    expect(result.manual_break_paragraph).toBe(3);
  });

  it("reloads the stale collection after insertBreak and reports the shifted index", async () => {
    // Regression for the Word-for-the-web failure: insertBreak adds
    // [empty artifact, \f] before the target, so the target's index shifts and
    // a stale items[] snapshot would report verified:false. The tool must
    // reload the collection, verify the \f, and return the CURRENT index.
    installWordMock(["Title", "Subtitle", "", "Table of Contents", "Intro"], false);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "Table of Contents" })
    );
    expect(result.verified).toBe(true);
    expect(result.paragraph).toBe(4);
    expect(result.manual_break_paragraph).toBe(3);
  });

  it("removes the empty artifact paragraph insertBreak leaves before the \\f break", async () => {
    const { store } = installWordMock(["Title", "Subtitle", "", "Table of Contents", "Intro"], false);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "Table of Contents" })
    );
    expect(result.method).toBe("manual");
    expect(result.verified).toBe(true);
    // The target's immediate predecessor is the \f — no empty artifact between.
    const tocIdx = store.findIndex((e) => e.text === "Table of Contents");
    expect(tocIdx).toBeGreaterThan(0);
    expect(store[tocIdx - 1].text).toBe("\f");
    expect(store[tocIdx - 1].deleted).toBe(false);
  });

  it("resolves heading_text by unique substring when exact match fails", async () => {
    const intro =
      "When you take a medication, unwrap a chocolate bar, or open a packet of coffee, there is a good chance that a machine helped.";
    installWordMock(["Title", "Subtitle", "", intro, "Section 2"], true);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "there is a good chance that a machine" })
    );
    expect(result.success).toBe(true);
    expect(result.paragraph).toBe(3);
  });

  it("returns a helpful error listing candidates when the text is not found", async () => {
    installWordMock(["Title", "Subtitle", "", "Intro"], true);
    const result = JSON.parse(
      await executeTool("set_page_break", { heading_text: "No such paragraph anywhere" })
    );
    expect(result.error).toContain("No paragraph matches");
    expect(result.error).toContain("paragraph index instead");
    expect(result.error).toContain("First 30 paragraphs");
  });

  it("addresses a paragraph by 0-based index", async () => {
    installWordMock(["Title", "Subtitle", "", "Intro"], true);
    const result = JSON.parse(await executeTool("set_page_break", { paragraph: 3 }));
    expect(result.success).toBe(true);
    expect(result.method).toBe("pageBreakBefore");
    expect(result.paragraph).toBe(3);
    expect(result.verified).toBe(true);
  });

  it("errors on an out-of-range index", async () => {
    installWordMock(["Title", "Subtitle"], true);
    const result = JSON.parse(await executeTool("set_page_break", { paragraph: 9 }));
    expect(result.error).toContain("out of range");
  });

  it("errors when neither paragraph nor heading_text is given", async () => {
    installWordMock(["Title", "Subtitle"], true);
    const result = JSON.parse(await executeTool("set_page_break", {}));
    expect(result.error).toContain("Provide either");
  });

  it("removes a pageBreakBefore break", async () => {
    const { setPbb } = installWordMock(["Title", "Subtitle", "", "Intro"], true);
    setPbb(3, true);
    const result = JSON.parse(await executeTool("set_page_break", { paragraph: 3, remove: true }));
    expect(result.success).toBe(true);
    expect(result.action).toBe("remove");
    expect(result.method).toBe("pageBreakBefore");
  });

  it("removes a standalone manual break paragraph before the target", async () => {
    const { store } = installWordMock(["Title", "\f", "Intro"], true);
    const result = JSON.parse(await executeTool("set_page_break", { paragraph: 2, remove: true }));
    expect(result.success).toBe(true);
    expect(result.method).toBe("manual");
    expect(store[1].deleted).toBe(true);
  });
});