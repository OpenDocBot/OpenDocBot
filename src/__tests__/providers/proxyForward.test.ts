/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";

const { mockHttpsRequest, mockHttpRequest } = vi.hoisted(() => ({
  mockHttpsRequest: vi.fn(),
  mockHttpRequest: vi.fn(),
}));

vi.mock("node:https", () => ({ default: { request: mockHttpsRequest } }));
vi.mock("node:http", () => ({ default: { request: mockHttpRequest } }));

// scripts/ lives outside the src tsconfig include, so it has no TS types.
// Vitest resolves the .mjs at runtime; tsc is told to ignore the import.
// @ts-expect-error -- no type declarations for scripts/proxy.mjs
import { forwardRequest } from "../../../scripts/proxy.mjs";

const BASE_URL = "https://opencode.ai/zen/go/v1";

function makeReq() {
  const req = new PassThrough() as any;
  req.headers = {};
  req.method = "POST";
  return req;
}

function makeRes() {
  const res = new PassThrough() as any;
  res.writeHead = vi.fn();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHttpsRequest.mockImplementation(((_opts: unknown, cb: any) => {
    const proxyRes = new PassThrough();
    cb(proxyRes);
    return new PassThrough();
  }) as any);
});

describe("proxy header forwarding", () => {
  it("forwards custom headers to the upstream request", () => {
    const req = makeReq();
    req.headers = {
      host: "opendocbot.com",
      "x-opencode-session": "abc-123",
      "x-app": "OpenDocBot",
      ":method": "POST",
      connection: "keep-alive",
    };
    const res = makeRes();

    forwardRequest(req, res, BASE_URL, "/responses");

    const opts = mockHttpsRequest.mock.calls[0][0];
    expect(opts.hostname).toBe("opencode.ai");
    expect(opts.headers["x-opencode-session"]).toBe("abc-123");
    expect(opts.headers["x-app"]).toBe("OpenDocBot");
  });

  it("drops pseudo-headers and hop-by-hop headers", () => {
    const req = makeReq();
    req.headers = {
      ":method": "POST",
      connection: "keep-alive",
      "transfer-encoding": "chunked",
      "x-session": "ok",
    };
    const res = makeRes();

    forwardRequest(req, res, BASE_URL, "/responses");

    const opts = mockHttpsRequest.mock.calls[0][0];
    expect(opts.headers[":method"]).toBeUndefined();
    expect(opts.headers.connection).toBeUndefined();
    expect(opts.headers["transfer-encoding"]).toBeUndefined();
    expect(opts.headers["x-session"]).toBe("ok");
  });

  it("rewrites the host header to the upstream target", () => {
    const req = makeReq();
    req.headers = { host: "opendocbot.com" };
    const res = makeRes();

    forwardRequest(req, res, BASE_URL, "/responses");

    const opts = mockHttpsRequest.mock.calls[0][0];
    expect(opts.headers.host).toBe("opencode.ai");
  });
});