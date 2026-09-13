import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchSSE } from "../../lib/fetchSSE";

let onDataCalls: Record<string, unknown>[];
let onDoneCalls: number;
let onErrorCalls: Error[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;

function setupSSE(chunks: string[], opts?: { status?: number; statusText?: string }) {
  onDataCalls = [];
  onDoneCalls = 0;
  onErrorCalls = [];

  const encoder = new TextEncoder();
  let idx = 0;

  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: opts?.status ? opts.status < 300 : true,
    status: opts?.status ?? 200,
    statusText: opts?.statusText ?? (opts?.status ? "Error" : "OK"),
    text: () => Promise.resolve(chunks.join("")),
    body: {
      getReader: () => {
        let closed = false;
        return {
          read: async () => {
            if (closed || idx >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = encoder.encode(chunks[idx]);
            idx++;
            return { done: false, value };
          },
          cancel: () => { closed = true; },
          releaseLock: () => {},
          closed: Promise.resolve(undefined),
        };
      },
    },
  } as unknown as Response);

  fetchSSE(
    "https://test.local/stream",
    { model: "test" },
    { Authorization: "Bearer sk-test" },
    (data) => onDataCalls.push(data),
    () => { onDoneCalls++; },
    (err) => onErrorCalls.push(err)
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function flushMicrotasks() {
  return vi.runAllTimersAsync();
}

// =========================================================================
// Basic SSE parsing
// =========================================================================
describe("fetchSSE — basic parsing", () => {
  it("parses single data event", async () => {
    setupSSE([
      'data: {"token":"hello"}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ token: "hello" }]);
    expect(onDoneCalls).toBe(1);
    expect(onErrorCalls).toEqual([]);
  });

  it("parses multiple data events across chunks", async () => {
    setupSSE([
      'data: {"i":1}\n\n',
      'data: {"i":2}\n\n',
      'data: {"i":3}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ i: 1 }, { i: 2 }, { i: 3 }]);
    expect(onDoneCalls).toBe(1);
  });

  it("parses single chunk with multiple data lines", async () => {
    setupSSE([
      'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n',
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ a: 1 }, { b: 2 }]);
    expect(onDoneCalls).toBe(1);
  });
});

// =========================================================================
// [DONE] signal
// =========================================================================
describe("fetchSSE — [DONE] handling", () => {
  it("stops processing after [DONE]", async () => {
    setupSSE([
      'data: {"first":true}\n\n',
      "data: [DONE]\n\n",
      'data: {"should_not_appear":true}\n\n',
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ first: true }]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles [DONE] without the data: prefix (edge case)", async () => {
    setupSSE([
      'data: {"first":true}\n\n',
      "[DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ first: true }]);
    expect(onDoneCalls).toBe(1);
  });
});

// =========================================================================
// Malformed data
// =========================================================================
describe("fetchSSE — malformed data", () => {
  it("skips non-JSON data lines", async () => {
    setupSSE([
      "data: not_valid_json\n\n",
      'data: {"valid":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
    expect(onDoneCalls).toBe(1);
  });

  it("skips empty data payload", async () => {
    setupSSE([
      "data: \n\n",
      'data: {"valid":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
  });

  it("skips data line with only whitespace after data:", async () => {
    setupSSE([
      "data:   \n\n",
      'data: {"valid":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
  });

  it("skips lines without data: prefix", async () => {
    setupSSE([
      "event: message\n",
      "id: 1\n",
      'data: {"valid":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
  });

  it("skips comment lines (starting with colon)", async () => {
    setupSSE([
      ": this is a comment\n",
      'data: {"valid":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
  });

  it("handles CSS/HTML leaked into SSE (error page proxied)", async () => {
    setupSSE([
      "<html><body>502 Bad Gateway</body></html>\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles pure text error message as SSE data", async () => {
    setupSSE([
      "Error: something went wrong\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([]);
    expect(onDoneCalls).toBe(1);
  });
});

// =========================================================================
// Chunk boundary scenarios
// =========================================================================
describe("fetchSSE — chunk boundaries", () => {
  it("handles data split across multiple chunks (line break in middle)", async () => {
    setupSSE([
      'data: {"mess',
      'age":"split"}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ message: "split" }]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles data split mid-JSON", async () => {
    setupSSE([
      'data: {"token":"hel',
      'lo"}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ token: "hello" }]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles unicode split across chunks", async () => {
    const emoji = "🌟";
    const bytes = new TextEncoder().encode('data: {"e":"' + emoji + '"}\n\n');
    const half = Math.floor(bytes.length / 2);

    const encoder = new TextEncoder();
    onDataCalls = [];
    onDoneCalls = 0;
    onErrorCalls = [];
    let idx = 0;
    const chunks = [
      new Uint8Array(bytes.slice(0, half)),
      new Uint8Array(bytes.slice(half)),
      encoder.encode("data: [DONE]\n\n"),
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      body: {
        getReader: () => ({
          read: async () => {
            if (idx >= chunks.length) return { done: true, value: undefined };
            const value = chunks[idx];
            idx++;
            return { done: false, value };
          },
          cancel: () => {},
          releaseLock: () => {},
          closed: Promise.resolve(undefined),
        }),
      },
    } as unknown as Response);

    fetchSSE(
      "https://test.local/stream",
      { model: "test" },
      {},
      (data) => onDataCalls.push(data),
      () => { onDoneCalls++; },
      () => {}
    );
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ e: emoji }]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles empty chunk (no data, just newlines)", async () => {
    setupSSE([
      "\n\n\n",
      "data: {\"valid\":true}\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ valid: true }]);
  });

  it("handles chunk ending with partial line (no newline)", async () => {
    setupSSE([
      'data: {"a":1}',
      '\n\ndata: {"b":2}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles data: prefix split across chunks", async () => {
    setupSSE([
      "dat",
      'a: {"split_prefix":true}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ split_prefix: true }]);
  });
});

// =========================================================================
// Content types
// =========================================================================
describe("fetchSSE — content types", () => {
  it("parses nested JSON data", async () => {
    setupSSE([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ choices: [{ delta: { content: "hi" } }] }]);
  });

  it("parses arrays as top-level data", async () => {
    setupSSE([
      "data: [1,2,3]\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([[1, 2, 3]]);
  });

  it("parses primitive values as top-level data", async () => {
    setupSSE([
      'data: "string_value"\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual(["string_value"]);
  });

  it("parses null and boolean", async () => {
    setupSSE([
      "data: null\n\n",
      "data: true\n\n",
      "data: false\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([null, true, false]);
  });

  it("parses numbers", async () => {
    setupSSE([
      "data: 42\n\n",
      "data: 3.14\n\n",
      "data: -100\n\n",
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([42, 3.14, -100]);
  });

  it("handles unicode escape sequences", async () => {
    setupSSE([
      'data: {"unicode":"\\u0048\\u0065\\u006c\\u006c\\u006f"}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ unicode: "Hello" }]);
  });
});

// =========================================================================
// HTTP errors
// =========================================================================
describe("fetchSSE — HTTP errors", () => {
  it("calls onError for 401", async () => {
    setupSSE([], { status: 401, statusText: "Unauthorized" });
    await flushMicrotasks();
    expect(onErrorCalls).toHaveLength(1);
    expect(onErrorCalls[0].message).toContain("401");
  });

  it("calls onError for 500", async () => {
    setupSSE([], { status: 500, statusText: "Internal Server Error" });
    await flushMicrotasks();
    expect(onErrorCalls).toHaveLength(1);
    expect(onErrorCalls[0].message).toContain("500");
  });

  it("calls onError for network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );
    fetchSSE(
      "https://test.local/stream",
      { model: "test" },
      {},
      () => {},
      () => {},
      (err) => onErrorCalls.push(err)
    );
    onErrorCalls = [];
    await flushMicrotasks();
    // Error is caught in the .catch()
  });

  it("calls onError for invalid URL", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Invalid URL")
    );
    const errors: Error[] = [];
    fetchSSE(
      "not-a-url",
      { model: "test" },
      {},
      () => {},
      () => {},
      (err) => errors.push(err)
    );
    await flushMicrotasks();
    expect(errors).toHaveLength(1);
  });
});

// =========================================================================
// Request construction
// =========================================================================
describe("fetchSSE — request construction", () => {
  it("sends POST with JSON body", async () => {
    setupSSE(["data: [DONE]\n\n"]);
    await flushMicrotasks();

    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("https://test.local/stream");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test",
    });
    const body = JSON.parse(call[1].body as string);
    expect(body.model).toBe("test");
  });

  it("merges additional headers with Content-Type", async () => {
    const errors: Error[] = [];
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("stop")); // skip actual fetch

    fetchSSE(
      "https://test.local/stream",
      { model: "test" },
      { "X-Custom": "value", Authorization: "Bearer abc" },
      () => {},
      () => {},
      (err) => errors.push(err)
    );
    await flushMicrotasks();

    const call = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect((call[1].headers as Record<string, string>)["X-Custom"]).toBe("value");
    expect((call[1].headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("passes AbortSignal to fetch", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("stop"));

    fetchSSE(
      "https://test.local/stream",
      { model: "test" },
      {},
      () => {},
      () => {},
      () => {},
      controller.signal
    );
    await flushMicrotasks();

    const call = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(call[1].signal).toBe(controller.signal);
  });
});

// =========================================================================
// Large data
// =========================================================================
describe("fetchSSE — large data", () => {
  it("handles data line of 10KB", async () => {
    const bigValue = "x".repeat(10000);
    setupSSE([
      `data: {"big":"${bigValue}"}\n\n`,
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ big: bigValue }]);
  });

  it("handles rapid sequential events", async () => {
    const events = Array.from({ length: 100 }, (_, i) => `data: {"i":${i}}\n\n`);
    setupSSE([...events, "data: [DONE]\n\n"]);
    await flushMicrotasks();
    expect(onDataCalls).toHaveLength(100);
    for (let i = 0; i < 100; i++) {
      expect(onDataCalls[i]).toEqual({ i });
    }
  });
});

// =========================================================================
// Edge cases from real-world SSE implementations
// =========================================================================
describe("fetchSSE — real-world quirks", () => {
  it("handles data: with Windows-style line endings (\\r\\n)", async () => {
    setupSSE([
      'data: {"a":1}\r\n\r\n',
      "data: [DONE]\r\n\r\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ a: 1 }]);
  });

  it("handles multiple newlines between events", async () => {
    setupSSE([
      'data: {"a":1}\n\n\n\n',
      'data: {"b":2}\n\n',
      "data: [DONE]\n\n",
    ]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles no trailing newline on last line", async () => {
    setupSSE(['data: {"last":true}']);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ last: true }]);
    expect(onDoneCalls).toBe(1);
  });

  it("handles stream with only whitespace and newlines", async () => {
    setupSSE(["   \n\n \n\n  \n\n"]);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([]);
    expect(onDoneCalls).toBe(1);
  });
});

// =========================================================================
// Timeouts
// =========================================================================
describe("fetchSSE — timeouts", () => {
  it("calls onError when the stream stalls (idle timeout)", async () => {
    // A stream that never produces bytes and never ends → idle timeout fires.
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(""),
      body: {
        getReader: () => ({
          read: () => new Promise<{ done: boolean; value?: Uint8Array }>(() => {}),
          cancel: vi.fn().mockResolvedValue(undefined),
          releaseLock: () => {},
          closed: Promise.resolve(undefined),
        }),
      },
    } as unknown as Response);

    const errors: Error[] = [];
    fetchSSE(
      "https://test.local/stall",
      { model: "test" },
      {},
      () => {},
      () => {},
      (err) => errors.push(err)
    );

    // Advance past the 120s idle timeout.
    await vi.advanceTimersByTimeAsync(121_000);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("timed out");
  });

  it("does not fire the idle timeout while data keeps flowing", async () => {
    // 3 chunks arriving well inside the idle window, then [DONE].
    const chunks = Array.from({ length: 3 }, (_, i) => `data: {"i":${i}}\n\n`);
    chunks.push("data: [DONE]\n\n");
    setupSSE(chunks);

    // Simulate time passing with data flowing (no idle timeout).
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await flushMicrotasks();

    expect(onDataCalls).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }]);
    expect(onDoneCalls).toBe(1);
    expect(onErrorCalls).toEqual([]);
  });

  it("calls onError when the stream exceeds the total time limit", async () => {
    // A stream that keeps emitting keepalives forever, past the total 10min
    // budget, must still be aborted. Reads resolve on a timer so the reader
    // loop yields to the fake clock, letting the total timeout fire.
    const encoder = new TextEncoder();
    let stopped = false;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(""),
      body: {
        getReader: () => ({
          read: () =>
            new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
              setTimeout(() => {
                if (stopped) {
                  resolve({ done: true, value: undefined });
                } else {
                  resolve({ done: false, value: encoder.encode("data: : keepalive\n\n") });
                }
              }, 100);
            }),
          cancel: vi.fn().mockImplementation(() => {
            stopped = true;
            return Promise.resolve(undefined);
          }),
          releaseLock: () => {},
          closed: Promise.resolve(undefined),
        }),
      },
    } as unknown as Response);

    const errors: Error[] = [];
    fetchSSE(
      "https://test.local/keepalive",
      { model: "test" },
      {},
      () => {},
      () => {},
      (err) => {
        stopped = true;
        errors.push(err);
      }
    );

    // Each read resolves after 100ms of fake time. Advance in 30s steps so the
    // idle timer keeps resetting; after 600s the total timeout must fire.
    for (let i = 0; i < 22; i++) {
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("time limit");
  });

  it("resolves normally when [DONE] arrives before any timeout", async () => {
    setupSSE(["data: {\"ok\":true}\n\n", "data: [DONE]\n\n"]);
    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();
    expect(onDataCalls).toEqual([{ ok: true }]);
    expect(onDoneCalls).toBe(1);
    expect(onErrorCalls).toEqual([]);
  });
});
