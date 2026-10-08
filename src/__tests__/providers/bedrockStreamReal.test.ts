import { describe, it, expect, vi, afterEach } from "vitest";
import { BedrockProvider } from "../../providers/bedrock";

/**
 * Regression test against a real `ConverseStream` response captured from
 * Bedrock (`application/vnd.amazon.eventstream`). The event type lives in the
 * `:event-type` header and the payload is the bare event body — the streaming
 * parser must dispatch on the header, not on a wrapper key in the payload.
 *
 * The capture is a Nemotron-super turn that emits text followed by a tool call.
 */
const REAL_STREAM_B64 =
  "AAAAtAAAAFIFAEFlCzpldmVudC10eXBlBwAMbWVzc2FnZVN0YXJ0DTpjb250ZW50LXR5cGUHABBhcHBsaWNhdGlvbi9qc29uDTptZXNzYWdlLXR5cGUHAAVldmVudHsicCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIiLCJyb2xlIjoiYXNzaXN0YW50In2fX38tAAAA4AAAAFe4+dzhCzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MCwiZGVsdGEiOnsidGV4dCI6IkknbGwgd3JpdGUgXCJoZWxsbyJ9LCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAifdJ6KrcAAADZAAAAVxTIBhYLOmV2ZW50LXR5cGUHABFjb250ZW50QmxvY2tEZWx0YQ06Y29udGVudC10eXBlBwAQYXBwbGljYXRpb24vanNvbg06bWVzc2FnZS10eXBlBwAFZXZlbnR7ImNvbnRlbnRCbG9ja0luZGV4IjowLCJkZWx0YSI6eyJ0ZXh0IjoiIHdvcmxkXCIgaW4gdGhlIGRvY3VtZW50IGZvciJ9LCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKIn2+3tZMAAAAyQAAAFd0KJGUCzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MCwiZGVsdGEiOnsidGV4dCI6IiB5b3UuIn0sInAiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE1OT1BRIn08d41nAAAAqwAAAFbg3YUvCzpldmVudC10eXBlBwAQY29udGVudEJsb2NrU3RvcA06Y29udGVudC10eXBlBwAQYXBwbGljYXRpb24vanNvbg06bWVzc2FnZS10eXBlBwAFZXZlbnR7ImNvbnRlbnRCbG9ja0luZGV4IjowLCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNIn0VggNpAAABCAAAAFdrAYNaCzpldmVudC10eXBlBwARY29udGVudEJsb2NrU3RhcnQNOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MSwicCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHkiLCJzdGFydCI6eyJ0b29sVXNlIjp7Im5hbWUiOiJ3cml0ZV9yYW5nZSIsInRvb2xVc2VJZCI6InRvb2x1c2VfR1hCMUVRdG5QdXJyMkU1eHJCMjBEeiIsInR5cGUiOiJ0b29sX3VzZSJ9fX2ypmcCAAAAvgAAAFc/2q1LCzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MSwiZGVsdGEiOnsidG9vbFVzZSI6eyJpbnB1dCI6IiJ9fSwicCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eCJ9c8KBmgAAAOEAAABXhZn1UQs6ZXZlbnQtdHlwZQcAEWNvbnRlbnRCbG9ja0RlbHRhDTpjb250ZW50LXR5cGUHABBhcHBsaWNhdGlvbi9qc29uDTptZXNzYWdlLXR5cGUHAAVldmVudHsiY29udGVudEJsb2NrSW5kZXgiOjEsImRlbHRhIjp7InRvb2xVc2UiOnsiaW5wdXQiOiJ7XCJyYW5nZV9hZGRyIn19LCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVCJ9xKC87AAAAMUAAABXsdh8lQs6ZXZlbnQtdHlwZQcAEWNvbnRlbnRCbG9ja0RlbHRhDTpjb250ZW50LXR5cGUHABBhcHBsaWNhdGlvbi9qc29uDTptZXNzYWdlLXR5cGUHAAVldmVudHsiY29udGVudEJsb2NrSW5kZXgiOjEsImRlbHRhIjp7InRvb2xVc2UiOnsiaW5wdXQiOiJlc3MifX0sInAiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCIn06ZrSDAAAA1wAAAFer+Lh3CzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MSwiZGVsdGEiOnsidG9vbFVzZSI6eyJpbnB1dCI6IlwiOiBcIkExXCIifX0sInAiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE0ife7W1H8AAAC4AAAAV7CaWOsLOmV2ZW50LXR5cGUHABFjb250ZW50QmxvY2tEZWx0YQ06Y29udGVudC10eXBlBwAQYXBwbGljYXRpb24vanNvbg06bWVzc2FnZS10eXBlBwAFZXZlbnR7ImNvbnRlbnRCbG9ja0luZGV4IjoxLCJkZWx0YSI6eyJ0b29sVXNlIjp7ImlucHV0IjoiLCBcInZhbHUifX0sInAiOiJhYmNkZWZnaGlqIn2LUTQfAAAA3wAAAFebiPO2CzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MSwiZGVsdGEiOnsidG9vbFVzZSI6eyJpbnB1dCI6ImVcIjogXCJoZWxsIn19LCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpBQkNERUZHSElKS0xNTk9QUVJTVCJ97PEKLwAAAL8AAABXArqE+ws6ZXZlbnQtdHlwZQcAEWNvbnRlbnRCbG9ja0RlbHRhDTpjb250ZW50LXR5cGUHABBhcHBsaWNhdGlvbi9qc29uDTptZXNzYWdlLXR5cGUHAAVldmVudHsiY29udGVudEJsb2NrSW5kZXgiOjEsImRlbHRhIjp7InRvb2xVc2UiOnsiaW5wdXQiOiJvIHdvcmxkIn19LCJwIjoiYWJjZGVmZ2hpamtsbW5vcHFyIn3CnL4MAAAArQAAAFcYmkAZCzpldmVudC10eXBlBwARY29udGVudEJsb2NrRGVsdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJjb250ZW50QmxvY2tJbmRleCI6MSwiZGVsdGEiOnsidG9vbFVzZSI6eyJpbnB1dCI6IlwifSJ9fSwicCI6ImFiY2QifURY6wgAAACiAAAAVu3N514LOmV2ZW50LXR5cGUHABBjb250ZW50QmxvY2tTdG9wDTpjb250ZW50LXR5cGUHABBhcHBsaWNhdGlvbi9qc29uDTptZXNzYWdlLXR5cGUHAAVldmVudHsiY29udGVudEJsb2NrSW5kZXgiOjEsInAiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0QifSquI7kAAAC7AAAAUR5Zhw4LOmV2ZW50LXR5cGUHAAttZXNzYWdlU3RvcA06Y29udGVudC10eXBlBwAQYXBwbGljYXRpb24vanNvbg06bWVzc2FnZS10eXBlBwAFZXZlbnR7InAiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ekFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaMDEyMzQ1Iiwic3RvcFJlYXNvbiI6InRvb2xfdXNlIn3Ln69qAAAA9wAAAE4OUj+zCzpldmVudC10eXBlBwAIbWV0YWRhdGENOmNvbnRlbnQtdHlwZQcAEGFwcGxpY2F0aW9uL2pzb24NOm1lc3NhZ2UtdHlwZQcABWV2ZW50eyJtZXRyaWNzIjp7ImxhdGVuY3lNcyI6Nzc2fSwicCI6ImFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6QUJDREVGIiwidXNhZ2UiOnsiaW5wdXRUb2tlbnMiOjU4Mywib3V0cHV0VG9rZW5zIjo4OCwic2VydmVyVG9vbFVzYWdlIjp7fSwidG90YWxUb2tlbnMiOjY3MX19JcHhnA==";

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function streamInChunks(data: Uint8Array, size: number): Response {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < data.length; i += size) {
          controller.enqueue(data.subarray(i, i + size));
        }
        controller.close();
      },
    }),
  } as unknown as Response;
}

afterEach(() => vi.restoreAllMocks());

describe("BedrockProvider.chatStream — real captured stream", () => {
  it("parses text + tool call from real EventStream bytes split across chunks", async () => {
    // 97 is coprime with the frame sizes, so frames are split mid-flight.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamInChunks(bytes(REAL_STREAM_B64), 97)
    );

    const provider = new BedrockProvider();
    const tokens: string[] = [];
    const calls: { name: string; args: string }[] = [];
    let finish: string | undefined;

    await provider.chatStream(
      [{ role: "user", content: "hi" }],
      (t) => tokens.push(t),
      (tc) => calls.push({ name: tc.function.name, args: tc.function.arguments }),
      [],
      {
        apiKey: "k",
        model: "nvidia.nemotron-super-3-120b",
        region: "us-east-1",
        maxTokens: 256,
      },
      undefined,
      (i) => {
        finish = i.finishReason;
      }
    );

    expect(tokens.join("")).toBe(
      'I\'ll write "hello world" in the document for you.'
    );
    expect(calls).toEqual([
      { name: "write_range", args: '{"range_address": "A1", "value": "hello world"}' },
    ]);
    expect(finish).toBe("stop");
  });
});
