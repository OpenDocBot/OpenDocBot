import { describe, it, expect } from "vitest";
import {
  BLOB_PREFIX,
  ConfigCryptoError,
  type ConfigCryptoErrorCode,
  type ConfigEnvelope,
  KDF_PARAMS_PRODUCTION,
  KDF_PARAMS_TEST,
  base64urlToBytes,
  bytesToBase64url,
  decryptConfig,
  defaultKdfParams,
  encryptConfig,
  isBlob,
  parseBlob,
} from "../../lib/configCrypto";

const PASS = "correct horse battery staple";

function reencode(envelope: unknown): string {
  return BLOB_PREFIX + bytesToBase64url(new TextEncoder().encode(JSON.stringify(envelope)));
}

/** Assert a sync call throws a ConfigCryptoError with the given code. */
function expectSyncCode(fn: () => unknown, code: ConfigCryptoErrorCode) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigCryptoError);
    expect((err as ConfigCryptoError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ConfigCryptoError(${code}) but nothing was thrown.`);
}

/** Assert an async call rejects with a ConfigCryptoError with the given code. */
async function expectAsyncCode(fn: () => Promise<unknown>, code: ConfigCryptoErrorCode) {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigCryptoError);
    expect((err as ConfigCryptoError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ConfigCryptoError(${code}) but nothing was thrown.`);
}

async function makeBlob(payload: Record<string, unknown> = { hello: "world" }): Promise<string> {
  return encryptConfig(payload, PASS, { kdfParams: KDF_PARAMS_TEST });
}

describe("configCrypto — base64url", () => {
  it("encodes and decodes empty input", () => {
    expect(bytesToBase64url(new Uint8Array())).toBe("");
    expect(base64urlToBytes("")).toEqual(new Uint8Array());
  });

  it("matches a known vector and is URL-safe (no padding)", () => {
    const encoded = bytesToBase64url(new TextEncoder().encode("hello"));
    expect(encoded).toBe("aGVsbG8");
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("round-trips every byte value across many lengths", () => {
    for (let length = 0; length <= 64; length++) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + length) & 0xff;
      expect(base64urlToBytes(bytesToBase64url(bytes))).toEqual(bytes);
    }
  });

  it("rejects invalid characters", () => {
    expectSyncCode(() => base64urlToBytes("abc!"), "BAD_FORMAT");
    expectSyncCode(() => base64urlToBytes("ab=c"), "BAD_FORMAT");
    expectSyncCode(() => base64urlToBytes("a+b/c"), "BAD_FORMAT");
  });

  it("rejects a length that cannot be produced by base64", () => {
    expectSyncCode(() => base64urlToBytes("a"), "BAD_FORMAT");
  });

  it("rejects non-string input", () => {
    expectSyncCode(() => base64urlToBytes(42 as unknown as string), "BAD_FORMAT");
  });
});

describe("configCrypto — blob shape", () => {
  it("produces a single-line blob with the ODB1. prefix", async () => {
    const blob = await makeBlob();
    expect(blob.startsWith(BLOB_PREFIX)).toBe(true);
    expect(blob).not.toMatch(/\s/);
    expect(isBlob(blob)).toBe(true);
  });

  it("detects non-blobs", () => {
    expect(isBlob("")).toBe(false);
    expect(isBlob("hello")).toBe(false);
    expect(isBlob(undefined)).toBe(false);
    expect(isBlob(123)).toBe(false);
    expect(isBlob(`  ${BLOB_PREFIX}abc  `)).toBe(true);
  });

  it("tolerates surrounding whitespace when parsing", async () => {
    const blob = await makeBlob();
    const envelope = parseBlob(`\n  ${blob}  \n`);
    expect(envelope.format).toBe("opendocbot-config");
  });
});

describe("configCrypto — round trip", () => {
  it("round-trips a config-like payload", async () => {
    const payload = {
      providerId: "custom",
      apiKey: "sk-123",
      customHeaders: { a: "1", b: "2" },
      maxTokens: 4096,
      humanInTheLoop: true,
    };
    const blob = await makeBlob(payload);
    const { payload: out } = await decryptConfig(blob, PASS);
    expect(out).toEqual(payload);
  });

  it("round-trips unicode, long strings and nested headers", async () => {
    const payload = {
      instructions: "Ünïcödé 🚀 日本語".repeat(20),
      apiKey: "sk-" + "x".repeat(10000),
      customHeaders: { "x-token": "🔑".repeat(50) },
    };
    const { payload: out } = await decryptConfig(await makeBlob(payload), PASS);
    expect(out).toEqual(payload);
  });

  it("records schemaVersion, appVersion and createdAt in the envelope", async () => {
    const blob = await encryptConfig({ a: 1 }, PASS, {
      kdfParams: KDF_PARAMS_TEST,
      schemaVersion: 7,
      appVersion: "9.9.9",
      createdAt: "2026-01-02T03:04:05.000Z",
    });
    const { envelope } = await decryptConfig(blob, PASS);
    expect(envelope.schemaVersion).toBe(7);
    expect(envelope.appVersion).toBe("9.9.9");
    expect(envelope.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("uses a fresh salt and IV on every export", async () => {
    const a = parseBlob(await makeBlob());
    const b = parseBlob(await makeBlob());
    expect(a.kdfParams.salt).not.toBe(b.kdfParams.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it("produces different ciphertext for different passphrases", async () => {
    const a = parseBlob(await encryptConfig({ a: 1 }, "pass-one", { kdfParams: KDF_PARAMS_TEST }));
    const b = parseBlob(await encryptConfig({ a: 1 }, "pass-two", { kdfParams: KDF_PARAMS_TEST }));
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe("configCrypto — passphrase handling", () => {
  it("rejects an empty passphrase on encrypt", async () => {
    await expectAsyncCode(() => encryptConfig({ a: 1 }, "", { kdfParams: KDF_PARAMS_TEST }), "EMPTY_PASSPHRASE");
  });

  it("rejects a whitespace-only passphrase on encrypt", async () => {
    await expectAsyncCode(() => encryptConfig({ a: 1 }, "   ", { kdfParams: KDF_PARAMS_TEST }), "EMPTY_PASSPHRASE");
  });

  it("rejects an empty passphrase on decrypt", async () => {
    const blob = await makeBlob();
    await expectAsyncCode(() => decryptConfig(blob, ""), "EMPTY_PASSPHRASE");
  });

  it("rejects a wrong passphrase", async () => {
    const blob = await makeBlob();
    await expectAsyncCode(() => decryptConfig(blob, "not-the-passphrase"), "WRONG_PASSPHRASE");
  });

  it("preserves leading/trailing spaces in the passphrase", async () => {
    const blob = await encryptConfig({ a: 1 }, "  spaced  ", { kdfParams: KDF_PARAMS_TEST });
    const ok = await decryptConfig(blob, "  spaced  ");
    expect(ok.payload).toEqual({ a: 1 });
    await expectAsyncCode(() => decryptConfig(blob, "spaced"), "WRONG_PASSPHRASE");
  });
});

describe("configCrypto — parseBlob validation", () => {
  it("parses a valid blob", async () => {
    const envelope = parseBlob(await makeBlob());
    expect(envelope.format).toBe("opendocbot-config");
    expect(envelope.version).toBe(1);
    expect(envelope.kdf).toBe("argon2id");
    expect(envelope.cipher).toBe("aes-256-gcm");
  });

  it("rejects a bad prefix", () => {
    expectSyncCode(() => parseBlob("NOPE.abc"), "BAD_FORMAT");
  });

  it("rejects empty or prefix-only input", () => {
    expectSyncCode(() => parseBlob(""), "BAD_FORMAT");
    expectSyncCode(() => parseBlob(BLOB_PREFIX), "BAD_FORMAT");
  });

  it("rejects non-string input", () => {
    expectSyncCode(() => parseBlob(null as unknown as string), "BAD_FORMAT");
  });

  it("rejects a body that is not valid base64url", () => {
    expectSyncCode(() => parseBlob(BLOB_PREFIX + "!!!!"), "BAD_FORMAT");
  });

  it("rejects a body that is not JSON", () => {
    const body = bytesToBase64url(new TextEncoder().encode("not json {{{"));
    expectSyncCode(() => parseBlob(BLOB_PREFIX + body), "BAD_ENVELOPE");
  });

  it("rejects a non-object envelope", () => {
    expectSyncCode(() => parseBlob(reencode([1, 2, 3])), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode("hi")), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode(null)), "BAD_ENVELOPE");
  });

  it("rejects an unknown format", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, format: "other" })), "BAD_ENVELOPE");
  });

  it("rejects a newer envelope version", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, version: 2 })), "UNSUPPORTED_VERSION");
    expectSyncCode(() => parseBlob(reencode({ ...env, version: 999 })), "UNSUPPORTED_VERSION");
  });

  it("rejects invalid version values", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, version: 0 })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, version: 1.5 })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, version: "1" })), "BAD_ENVELOPE");
  });

  it("rejects unknown algorithms", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, kdf: "pbkdf2" })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, cipher: "aes-256-cbc" })), "BAD_ENVELOPE");
  });

  it("rejects missing or invalid kdf params", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: undefined })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: [] })), "BAD_ENVELOPE");
    expectSyncCode(
      () => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, t: "3" } })),
      "BAD_ENVELOPE",
    );
  });

  it("bounds the KDF params to prevent a DoS blob", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, t: 0 } })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, t: 11 } })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, m: 100 } })), "BAD_ENVELOPE");
    expectSyncCode(
      () => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, m: 262145 } })),
      "BAD_ENVELOPE",
    );
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, p: 5 } })), "BAD_ENVELOPE");
    expectSyncCode(
      () => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, dkLen: 16 } })),
      "BAD_ENVELOPE",
    );
  });

  it("rejects invalid salt lengths", async () => {
    const env = parseBlob(await makeBlob());
    const short = bytesToBase64url(new Uint8Array(8));
    const long = bytesToBase64url(new Uint8Array(65));
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, salt: short } })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, salt: long } })), "BAD_ENVELOPE");
    expectSyncCode(
      () => parseBlob(reencode({ ...env, kdfParams: { ...env.kdfParams, salt: "not-base64!!" } })),
      "BAD_ENVELOPE",
    );
  });

  it("rejects an invalid IV", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(
      () => parseBlob(reencode({ ...env, iv: bytesToBase64url(new Uint8Array(16)) })),
      "BAD_ENVELOPE",
    );
    expectSyncCode(() => parseBlob(reencode({ ...env, iv: "!!!" })), "BAD_ENVELOPE");
  });

  it("rejects a too-short ciphertext", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(
      () => parseBlob(reencode({ ...env, ciphertext: bytesToBase64url(new Uint8Array(8)) })),
      "BAD_ENVELOPE",
    );
  });

  it("rejects a negative or non-integer schema version", async () => {
    const env = parseBlob(await makeBlob());
    expectSyncCode(() => parseBlob(reencode({ ...env, schemaVersion: -1 })), "BAD_ENVELOPE");
    expectSyncCode(() => parseBlob(reencode({ ...env, schemaVersion: 1.5 })), "BAD_ENVELOPE");
  });
});

describe("configCrypto — tampering", () => {
  it("rejects a modified ciphertext", async () => {
    const env = parseBlob(await makeBlob());
    const bytes = base64urlToBytes(env.ciphertext);
    bytes[0] ^= 0x01;
    const tampered = reencode({ ...env, ciphertext: bytesToBase64url(bytes) });
    await expectAsyncCode(() => decryptConfig(tampered, PASS), "WRONG_PASSPHRASE");
  });

  it("rejects a modified IV", async () => {
    const env = parseBlob(await makeBlob());
    const iv = base64urlToBytes(env.iv);
    iv[0] ^= 0xff;
    const tampered = reencode({ ...env, iv: bytesToBase64url(iv) });
    await expectAsyncCode(() => decryptConfig(tampered, PASS), "WRONG_PASSPHRASE");
  });

  it("rejects a modified salt", async () => {
    const env = parseBlob(await makeBlob());
    const salt = new Uint8Array(32).fill(7);
    const tampered = reencode({ ...env, kdfParams: { ...env.kdfParams, salt: bytesToBase64url(salt) } });
    await expectAsyncCode(() => decryptConfig(tampered, PASS), "WRONG_PASSPHRASE");
  });

  it("rejects tampered header fields via the AAD", async () => {
    const env = parseBlob(await makeBlob());
    // A different (still valid) work factor changes both the AAD and the key.
    const tampered = reencode({ ...env, kdfParams: { ...env.kdfParams, t: 2 } });
    await expectAsyncCode(() => decryptConfig(tampered, PASS), "WRONG_PASSPHRASE");
  });

  it("does not authenticate metadata fields (schemaVersion/appVersion/createdAt)", async () => {
    const blob = await encryptConfig({ a: 1 }, PASS, {
      kdfParams: KDF_PARAMS_TEST,
      schemaVersion: 1,
      appVersion: "1.0.0",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const env = parseBlob(blob);
    const tampered = reencode({ ...env, schemaVersion: 99, appVersion: "9.9.9", createdAt: "n/a" });
    const { payload, envelope } = await decryptConfig(tampered, PASS);
    expect(payload).toEqual({ a: 1 });
    expect(envelope.schemaVersion).toBe(99);
  });
});

describe("configCrypto — KDF params", () => {
  it("uses the cheap test params under Vitest", () => {
    expect(defaultKdfParams()).toEqual(KDF_PARAMS_TEST);
  });

  it("exposes production params suitable for Argon2id", () => {
    expect(KDF_PARAMS_PRODUCTION.t).toBeGreaterThanOrEqual(1);
    expect(KDF_PARAMS_PRODUCTION.m).toBeGreaterThanOrEqual(65536);
    expect(KDF_PARAMS_PRODUCTION.p).toBeGreaterThanOrEqual(1);
    expect(KDF_PARAMS_PRODUCTION.dkLen).toBe(32);
  });

  it(
    "round-trips with the production work factors",
    async () => {
      const blob = await encryptConfig({ production: true }, PASS, {
        kdfParams: KDF_PARAMS_PRODUCTION,
      });
      const { payload } = await decryptConfig(blob, PASS);
      expect(payload).toEqual({ production: true });
    },
    30000,
  );

  it("decrypts a blob regardless of the current default params (params come from the blob)", async () => {
    const custom = { t: 2, m: 2048, p: 1, dkLen: 32 };
    const blob = await encryptConfig({ a: 1 }, PASS, { kdfParams: custom });
    // Decrypt reads the params from the envelope, not the test default.
    const { payload, envelope } = await decryptConfig(blob, PASS);
    expect(payload).toEqual({ a: 1 });
    expect(envelope.kdfParams.m).toBe(2048);
  });
});

describe("configCrypto — envelope typing", () => {
  it("returns a well-formed envelope object", async () => {
    const envelope: ConfigEnvelope = parseBlob(await makeBlob());
    expect(Object.keys(envelope).sort()).toEqual(
      [
        "appVersion",
        "cipher",
        "ciphertext",
        "createdAt",
        "format",
        "iv",
        "kdf",
        "kdfParams",
        "schemaVersion",
        "version",
      ].sort(),
    );
  });
});
