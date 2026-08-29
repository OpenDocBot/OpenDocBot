import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildDocState, buildUserSelection } from "../../tools/docState";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

function mockPowerPointHost() {
  g.Office = {
    onReady: () => {},
    context: { host: "PowerPoint" },
    HostType: { Word: "Word", Excel: "Excel", PowerPoint: "PowerPoint" },
  };
}

beforeEach(() => {
  g.Office = undefined;
  g.PowerPoint = undefined;
});

function installMockPresentation() {
  const sync = vi.fn().mockResolvedValue(undefined);

  const slides = [
    {
      id: "256",
      layout: { name: "Title Slide", load: vi.fn() },
      shapes: {
        items: [
          { textFrame: { textRange: { text: "Quarterly Review" } } },
          { textFrame: { textRange: { text: "" } } },
        ],
        load: vi.fn(),
      },
      load: vi.fn(),
    },
    {
      id: "257",
      layout: { name: "Title and Content", load: vi.fn() },
      shapes: {
        items: [
          { textFrame: { textRange: { text: "Revenue Trends" } } },
          { textFrame: { textRange: { text: "Bullet one" } } },
        ],
        load: vi.fn(),
      },
      load: vi.fn(),
    },
  ];

  const context = {
    presentation: {
      title: "FY2026 Planning",
      slides: { items: slides, load: vi.fn() },
      load: vi.fn(),
    },
    sync,
  };

  mockPowerPointHost();
  g.PowerPoint = { run: (fn: (ctx: unknown) => unknown) => fn(context) };

  return { context, slides };
}

describe("buildDocState (powerpoint dev mode)", () => {
  it("returns dev-mode snapshot when PowerPoint is unavailable", async () => {
    mockPowerPointHost();
    const state = await buildDocState();
    expect(state).toContain("<doc_state>");
    expect(state).toContain("No presentation loaded");
  });
});

describe("buildDocState (mocked PowerPoint)", () => {
  it("renders presentation title and slide outline", async () => {
    installMockPresentation();
    const state = await buildDocState();
    expect(state).toContain("<doc_state>");
    expect(state).toContain("Presentation: FY2026 Planning");
    expect(state).toContain("Slides: 2");
    expect(state).toContain('[1] slide 256 (Title Slide, 2 shapes) — "Quarterly Review"');
    expect(state).toContain('[2] slide 257 (Title and Content, 2 shapes) — "Revenue Trends"');
  });

  it("falls back to error text when PowerPoint.run throws", async () => {
    installMockPresentation();
    g.PowerPoint = { run: () => Promise.reject(new Error("PowerPoint crashed")) };
    const state = await buildDocState();
    expect(state).toContain("Error reading presentation: PowerPoint crashed");
  });
});

describe("buildUserSelection (powerpoint)", () => {
  it("returns empty string (no selection API)", async () => {
    installMockPresentation();
    const selection = await buildUserSelection();
    expect(selection).toBe("");
  });
});
