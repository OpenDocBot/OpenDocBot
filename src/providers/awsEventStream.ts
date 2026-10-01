/**
 * Incremental decoder for the AWS EventStream binary framing used by
 * `ConverseStream` (`application/vnd.amazon.eventstream`).
 *
 * Frame layout (all integers big-endian):
 *   [0..4)   total byte length (prelude + headers + payload + message CRC)
 *   [4..8)   headers byte length
 *   [8..12)  prelude CRC
 *   [12..)   headers, then payload (total - 12 - headersLen - 4), then CRCs
 *
 * Each header is: 1-byte name length, name, 1-byte value type, 1-byte
 * ... actually 2-byte value length, value. We only need string and the
 * error metadata headers, so other value types are skipped by size.
 *
 * The decoder buffers partial frames: `push` may be called with a chunk that
 * contains zero, one, or many complete frames, or a fragment of a frame.
 */

export interface EventStreamMessage {
  headers: Record<string, string>;
  payload: Uint8Array;
}

const PRELUDE = 12;
const MESSAGE_CRC = 4;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseHeaders(bytes: Uint8Array): Record<string, string> {
  const headers: Record<string, string> = {};
  let i = 0;
  while (i < bytes.length) {
    const nameLen = bytes[i++];
    if (i + nameLen > bytes.length) break;
    const name = decodeUtf8(bytes.subarray(i, i + nameLen));
    i += nameLen;
    if (i >= bytes.length) break;
    const type = bytes[i++];
    let value = "";
    switch (type) {
      case 0:
        value = "true";
        break;
      case 1:
        value = "false";
        break;
      case 2:
        i += 1;
        break;
      case 3:
        i += 2;
        break;
      case 4:
        i += 4;
        break;
      case 5:
      case 8:
        i += 8;
        break;
      case 9:
        i += 16;
        break;
      case 6:
      case 7: {
        if (i + 2 > bytes.length) return headers;
        const len = (bytes[i] << 8) | bytes[i + 1];
        i += 2;
        if (i + len > bytes.length) return headers;
        if (type === 7) value = decodeUtf8(bytes.subarray(i, i + len));
        i += len;
        break;
      }
      default:
        return headers;
    }
    if (name) headers[name] = value;
  }
  return headers;
}

export class AwsEventStreamDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): EventStreamMessage[] {
    if (chunk.length > 0) {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer, 0);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }

    const out: EventStreamMessage[] = [];
    while (this.buffer.length >= PRELUDE + MESSAGE_CRC) {
      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength
      );
      const totalLen = view.getUint32(0);
      const headersLen = view.getUint32(4);
      // Guard against a corrupt/oversized length that would stall forever.
      if (totalLen < PRELUDE + MESSAGE_CRC || totalLen > 64 * 1024 * 1024) {
        this.buffer = new Uint8Array(0);
        break;
      }
      if (this.buffer.length < totalLen) break;

      const headersEnd = PRELUDE + headersLen;
      const payloadEnd = totalLen - MESSAGE_CRC;
      if (headersEnd > payloadEnd) {
        this.buffer = new Uint8Array(0);
        break;
      }

      const headers = parseHeaders(this.buffer.subarray(PRELUDE, headersEnd));
      const payload = this.buffer.slice(headersEnd, payloadEnd);
      out.push({ headers, payload });
      this.buffer = this.buffer.slice(totalLen);
    }
    return out;
  }
}
