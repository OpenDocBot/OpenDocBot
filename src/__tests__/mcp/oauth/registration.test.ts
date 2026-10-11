import { describe, it, expect, vi } from "vitest";
import { buildClientMetadata, registerClient } from "../../../mcp/oauth/registration";

const asFetch = (fn: (url: string) => Promise<Response>) =>
  vi.fn((input: RequestInfo | URL) => fn(String(input))) as unknown as typeof fetch;

describe("registration", () => {
  it("builds public-client metadata", () => {
    const md = buildClientMetadata("https://app.example/auth/mcp.html");
    expect(md.redirect_uris).toEqual(["https://app.example/auth/mcp.html"]);
    expect(md.token_endpoint_auth_method).toBe("none");
    expect(md.grant_types).toContain("authorization_code");
  });

  it("registers and returns the client id", async () => {
    const fetchImpl = asFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ client_id: "abc" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const out = await registerClient("https://auth.example/register", "https://app.example/cb", fetchImpl);
    expect(out.clientId).toBe("abc");
  });

  it("throws on failure", async () => {
    const fetchImpl = asFetch(() => Promise.resolve(new Response("nope", { status: 400 })));
    await expect(
      registerClient("https://auth.example/register", "https://app.example/cb", fetchImpl),
    ).rejects.toThrow(/registration failed/);
  });
});
