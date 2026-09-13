import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { executeTool } from "../../tools/registry";

// Import registers the tools
import "../../tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

function mockHost(host: "Word" | "Excel" | "PowerPoint") {
  g.Office = {
    onReady: () => {},
    context: { host },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
  };
}

function installRun(globalName: "Word" | "Excel" | "PowerPoint") {
  g[globalName] = {
    run: (fn: (ctx: unknown) => unknown) => fn({ sync: () => Promise.resolve() }),
  };
}

beforeEach(() => {
  g.Office = undefined;
  g.Word = undefined;
  g.Excel = undefined;
  g.PowerPoint = undefined;
});

afterEach(() => {
  g.Office = undefined;
  g.Word = undefined;
  g.Excel = undefined;
  g.PowerPoint = undefined;
});

describe("execute_office_js — caught errors surface as errors", () => {
  it("returns error (not success) when Word code throws", async () => {
    mockHost("Word");
    installRun("Word");
    const result = JSON.parse(
      await executeTool("execute_office_js", { code: `throw new Error("boom");` })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("boom");
    expect(result.error).toContain("NOT transactional");
  });

  it("returns error when Excel code throws", async () => {
    mockHost("Excel");
    installRun("Excel");
    const result = JSON.parse(
      await executeTool("execute_office_js", { code: `throw new Error("xl boom");` })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("xl boom");
  });

  it("returns error when PowerPoint code throws (the background-trap case)", async () => {
    mockHost("PowerPoint");
    installRun("PowerPoint");
    // Simulates the model trying slide.background, which is unavailable at this
    // API level and would throw at runtime.
    const result = JSON.parse(
      await executeTool("execute_office_js", { code: `slide.background.fill.setSolidColor("#000");` })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("NOT transactional");
  });

  it("still returns success with the result when code runs fine", async () => {
    mockHost("Word");
    installRun("Word");
    const result = JSON.parse(
      await executeTool("execute_office_js", { code: `return 42;` })
    );
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });
});

describe("execute_office_js — property-not-loaded hint", () => {
  it("appends load/sync guidance for a Spanish property-not-loaded error", async () => {
    mockHost("PowerPoint");
    installRun("PowerPoint");
    const result = JSON.parse(
      await executeTool("execute_office_js", {
        code: `throw new Error('La propiedad "top" no está disponible. Antes de leer el valor de la propiedad, llame al método de carga en el objeto contenedor.');`,
      })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain('La propiedad "top" no está disponible');
    expect(result.error).toContain(".load(");
    expect(result.error).toContain("context.sync()");
  });

  it("appends load/sync guidance for an English property-not-loaded error", async () => {
    mockHost("Word");
    installRun("Word");
    const result = JSON.parse(
      await executeTool("execute_office_js", {
        code: `throw new Error('The property "styleBuiltIn" is not available. Before reading the value of the property, call the load method.');`,
      })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("not available");
    expect(result.error).toContain(".load(");
    expect(result.error).toContain("context.sync()");
  });

  it("surfaces OfficeExtension debugInfo on generic errors", async () => {
    mockHost("Word");
    installRun("Word");
    const result = JSON.parse(
      await executeTool("execute_office_js", {
        code: `throw Object.assign(new Error("Sorry, something went wrong. Check the OfficeExtension.Error.debugInfo for more information."), { debugInfo: { errors: [{ message: "InvalidRequest" }] } });`,
      })
    );
    expect(result.success).toBeUndefined();
    expect(result.error).toContain("Sorry, something went wrong");
    expect(result.error).toContain("Office debugInfo: InvalidRequest");
  });
});
