import { describe, it, expect } from "vitest";
import { AwsEventStreamDecoder } from "../../providers/awsEventStream";

const encoder = new TextEncoder();
const decoderUtf8 = new TextDecoder();

/** Encode a single header entry: name, 1-byte type, then a type-specific value. */
function header(name: string, type: number, raw: number[] = []): number[] {
  const n = encoder.encode(name);
  const out = [n.length, ...n, type];
  if (type === 6 || type === 7) {
    out.push((raw.length >> 8) & 0xff, raw.length & 0xff, ...raw);
  } else {
    out.push(...raw);
  }
  return out;
}

function encodeHeaders(headers: Record<string, string>): Uint8Array {
  const bytes: number[] = [];
  for (const [key, value] of Object.entries(headers)) {
    bytes.push(...header(key, 7, [...encoder.encode(value)]));
  }
  return new Uint8Array(bytes);
}

function rawFrame(payload: Uint8Array, headerBytes: Uint8Array): Uint8Array {
  const total = 12 + headerBytes.length + payload.length + 4;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  view.setUint32(0, total);
  view.setUint32(4, headerBytes.length);
  view.setUint32(8, 0); // prelude CRC (not validated by the decoder)
  buf.set(headerBytes, 12);
  buf.set(payload, 12 + headerBytes.length);
  // message CRC left zero (not validated)
  return buf;
}

function frame(
  payload: unknown,
  headers: Record<string, string> = { ":message-type": "event" }
): Uint8Array {
  return rawFrame(encoder.encode(JSON.stringify(payload)), encodeHeaders(headers));
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function payloadOf(message: { payload: Uint8Array }): unknown {
  return JSON.parse(decoderUtf8.decode(message.payload));
}

describe("AwsEventStreamDecoder — framing", () => {
  it("decodes a single frame", () => {
    const messages = new AwsEventStreamDecoder().push(
      frame({ messageStart: { role: "assistant" } })
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].headers[":message-type"]).toBe("event");
    expect(payloadOf(messages[0])).toEqual({ messageStart: { role: "assistant" } });
  });

  it("decodes multiple frames in one chunk", () => {
    const decoder = new AwsEventStreamDecoder();
    const chunk = concat(
      frame({ messageStart: { role: "assistant" } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "a" } } }),
      frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "b" } } })
    );
    expect(decoder.push(chunk)).toHaveLength(3);
  });

  it("reassembles a frame delivered one byte at a time", () => {
    const bytes = frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "bytewise" } } });
    const decoder = new AwsEventStreamDecoder();
    let produced = 0;
    for (let i = 0; i < bytes.length - 1; i++) {
      produced += decoder.push(bytes.subarray(i, i + 1)).length;
      expect(produced).toBe(0);
    }
    const last = decoder.push(bytes.subarray(bytes.length - 1));
    expect(last).toHaveLength(1);
    expect((payloadOf(last[0]) as { contentBlockDelta: { delta: { text: string } } }).contentBlockDelta.delta.text).toBe("bytewise");
  });

  it("keeps a trailing partial frame buffered for the next push", () => {
    const decoder = new AwsEventStreamDecoder();
    const first = frame({ messageStart: { role: "assistant" } });
    const second = frame({ messageStop: { stopReason: "end_turn" } });
    expect(decoder.push(concat(first, second.subarray(0, 5)))).toHaveLength(1);
    const rest = decoder.push(second.subarray(5));
    expect(rest).toHaveLength(1);
    expect(payloadOf(rest[0])).toEqual({ messageStop: { stopReason: "end_turn" } });
  });

  it("handles a zero-length payload", () => {
    const messages = new AwsEventStreamDecoder().push(rawFrame(new Uint8Array(0), encodeHeaders({ a: "b" })));
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toHaveLength(0);
  });

  it("decodes a large payload", () => {
    const big = "x".repeat(500_000);
    const messages = new AwsEventStreamDecoder().push(
      rawFrame(encoder.encode(big), encodeHeaders({ ":message-type": "event" }))
    );
    expect(decoderUtf8.decode(messages[0].payload)).toHaveLength(500_000);
  });

  it("preserves multi-byte UTF-8 split across chunk boundaries", () => {
    const bytes = frame({ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "héllo 世界" } } });
    const decoder = new AwsEventStreamDecoder();
    // Split in the middle of the payload, likely mid-codepoint.
    const mid = Math.floor(bytes.length / 2);
    decoder.push(bytes.subarray(0, mid));
    const rest = decoder.push(bytes.subarray(mid));
    expect(rest).toHaveLength(1);
    expect((payloadOf(rest[0]) as { contentBlockDelta: { delta: { text: string } } }).contentBlockDelta.delta.text).toBe("héllo 世界");
  });

  it("returns nothing for an empty push", () => {
    const decoder = new AwsEventStreamDecoder();
    expect(decoder.push(new Uint8Array(0))).toHaveLength(0);
    expect(decoder.push(new Uint8Array(0))).toHaveLength(0);
  });
});

describe("AwsEventStreamDecoder — headers", () => {
  it("skips non-string header value types without desyncing", () => {
    const headerBytes = new Uint8Array([
      ...header("boolTrue", 0),
      ...header("boolFalse", 1),
      ...header("byte", 2, [0x01]),
      ...header("short", 3, [0x00, 0x02]),
      ...header("int", 4, [0x00, 0x00, 0x00, 0x03]),
      ...header("long", 5, [0, 0, 0, 0, 0, 0, 0, 4]),
      ...header("byteArray", 6, [1, 2, 3]),
      ...header("uuid", 9, new Array(16).fill(0)),
      ...header(":message-type", 7, [...encoder.encode("event")]),
    ]);
    const messages = new AwsEventStreamDecoder().push(
      rawFrame(encoder.encode("{}"), headerBytes)
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].headers[":message-type"]).toBe("event");
    expect(messages[0].headers.boolTrue).toBe("true");
    expect(messages[0].headers.boolFalse).toBe("false");
  });

  it("captures exception metadata headers", () => {
    const messages = new AwsEventStreamDecoder().push(
      frame(
        { throttlingException: { message: "slow down" } },
        { ":message-type": "exception", ":exception-type": "throttlingException" }
      )
    );
    expect(messages[0].headers[":message-type"]).toBe("exception");
    expect(messages[0].headers[":exception-type"]).toBe("throttlingException");
  });
});

describe("AwsEventStreamDecoder — corruption resistance", () => {
  it("discards a frame whose header length overflows the total length", () => {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 16);
    view.setUint32(4, 4); // headersEnd (16) > payloadEnd (12)
    const decoder = new AwsEventStreamDecoder();
    expect(decoder.push(bytes)).toHaveLength(0);
    // The buffer was reset, so a following valid frame still decodes.
    expect(decoder.push(frame({ ok: true }))).toHaveLength(1);
  });

  it("discards a frame whose declared length is impossibly small", () => {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 4);
    const decoder = new AwsEventStreamDecoder();
    expect(decoder.push(bytes)).toHaveLength(0);
    expect(decoder.push(frame({ messageStop: { stopReason: "end_turn" } }))).toHaveLength(1);
  });

  it("discards a frame whose declared length is absurdly large", () => {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 0xffffffff);
    new DataView(bytes.buffer).setUint32(4, 0);
    const decoder = new AwsEventStreamDecoder();
    expect(decoder.push(bytes)).toHaveLength(0);
    expect(decoder.push(frame({ ok: true }))).toHaveLength(1);
  });
});

describe("AwsEventStreamDecoder — header value types", () => {
  it.each([
    ["bool true", 0, [] as number[]],
    ["bool false", 1, []],
    ["byte", 2, [0x01]],
    ["short", 3, [0x00, 0x02]],
    ["int", 4, [0x00, 0x00, 0x00, 0x03]],
    ["long", 5, [0, 0, 0, 0, 0, 0, 0, 4]],
    ["byte array", 6, [1, 2, 3, 4]],
    ["timestamp", 8, [0, 0, 0, 0, 0, 0, 0, 0]],
    ["uuid", 9, new Array(16).fill(7)],
  ])("skips a %s header and still reads the next one", (_label, type, raw) => {
    const headerBytes = new Uint8Array([
      ...header("skipme", type as number, raw as number[]),
      ...header(":message-type", 7, [...encoder.encode("event")]),
    ]);
    const messages = new AwsEventStreamDecoder().push(
      rawFrame(encoder.encode("{}"), headerBytes)
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].headers[":message-type"]).toBe("event");
  });

  it("reads a zero-length string header value", () => {
    const headerBytes = new Uint8Array([
      ...header("empty", 7, []),
      ...header(":message-type", 7, [...encoder.encode("event")]),
    ]);
    const messages = new AwsEventStreamDecoder().push(rawFrame(encoder.encode("x"), headerBytes));
    expect(messages[0].headers.empty).toBe("");
    expect(messages[0].headers[":message-type"]).toBe("event");
  });

  it("decodes multiple custom string headers", () => {
    const headerBytes = new Uint8Array([
      ...header("a", 7, [...encoder.encode("1")]),
      ...header("b", 7, [...encoder.encode("2")]),
      ...header(":event-type", 7, [...encoder.encode("contentBlockDelta")]),
    ]);
    const messages = new AwsEventStreamDecoder().push(rawFrame(encoder.encode("{}"), headerBytes));
    expect(messages[0].headers).toMatchObject({ a: "1", b: "2", ":event-type": "contentBlockDelta" });
  });

  it("assembles a frame from many small pushes", () => {
    const bytes = frame({ messageStop: { stopReason: "end_turn" } });
    const decoder = new AwsEventStreamDecoder();
    let count = 0;
    for (let i = 0; i < bytes.length; i += 3) {
      count += decoder.push(bytes.subarray(i, i + 3)).length;
    }
    expect(count).toBe(1);
  });
});
