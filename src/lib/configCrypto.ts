import { argon2id } from "@noble/hashes/argon2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";

/**
 * Client-side encryption for exported configuration bundles.
 *
 * A passphrase is stretched with Argon2id into a 256-bit key, which encrypts the
 * JSON payload with AES-256-GCM. The envelope header (algorithm, KDF params,
 * version) is bound as GCM additional authenticated data, so tampering with any
 * header field makes decryption fail. Nothing here talks to a server: export and
 * import are fully local.
 */

export const BLOB_PREFIX = "ODB1.";
export const ENVELOPE_FORMAT = "opendocbot-config";
export const ENVELOPE_VERSION = 1;
export const KDF_ID = "argon2id";
export const CIPHER_ID = "aes-256-gcm";

const SALT_BYTES = 32;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const DKLEN = 32;

/** Argon2id work factors. `m` is memory in KiB. */
export interface Argon2Params {
  t: number;
  m: number;
  p: number;
  dkLen: number;
}

/**
 * Production work factors (roughly 64 MiB, 3 passes). Tune if needed; the params
 * are stored in the envelope so old exports keep decrypting.
 */
export const KDF_PARAMS_PRODUCTION: Argon2Params = { t: 3, m: 65536, p: 1, dkLen: DKLEN };

/**
 * Cheap work factors for the test suite so crypto tests stay fast. Selected
 * automatically when running under Vitest; production builds always use
 * `KDF_PARAMS_PRODUCTION`.
 */
export const KDF_PARAMS_TEST: Argon2Params = { t: 1, m: 1024, p: 1, dkLen: DKLEN };

/** Bounds applied to params read from an untrusted blob, to prevent DoS. */
const BOUNDS = {
  t: [1, 10],
  m: [1024, 262144],
  p: [1, 4],
} as const;

export function defaultKdfParams(): Argon2Params {
  return import.meta.env.MODE === "test" ? { ...KDF_PARAMS_TEST } : { ...KDF_PARAMS_PRODUCTION };
}

export interface ConfigEnvelope {
  format: string;
  version: number;
  kdf: string;
  kdfParams: Argon2Params & { salt: string };
  cipher: string;
  iv: string;
  ciphertext: string;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
}

export type ConfigCryptoErrorCode =
  | "EMPTY_PASSPHRASE"
  | "BAD_FORMAT"
  | "BAD_ENVELOPE"
  | "UNSUPPORTED_VERSION"
  | "WRONG_PASSPHRASE"
  | "DECRYPT_FAILED";

export class ConfigCryptoError extends Error {
  readonly code: ConfigCryptoErrorCode;
  constructor(code: ConfigCryptoErrorCode, message: string) {
    super(message);
    this.name = "ConfigCryptoError";
    this.code = code;
  }
}

// --- base64url (no padding, URL-safe) -------------------------------------

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_LOOKUP: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function bytesToBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (hasB1) out += B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (hasB2) out += B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function base64urlToBytes(value: string): Uint8Array {
  if (typeof value !== "string") {
    throw new ConfigCryptoError("BAD_FORMAT", "Expected a base64url string.");
  }
  if (value.length % 4 === 1) {
    throw new ConfigCryptoError("BAD_FORMAT", "Malformed base64url string.");
  }
  const out = new Uint8Array(Math.floor((value.length * 3) / 4));
  let outLen = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const v = code < 128 ? B64_LOOKUP[code] : -1;
    if (v < 0) {
      throw new ConfigCryptoError("BAD_FORMAT", "Malformed base64url string.");
    }
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outLen++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, outLen);
}

// --- helpers ---------------------------------------------------------------

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function within(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

function isEmptyPassphrase(passphrase: unknown): boolean {
  return typeof passphrase !== "string" || passphrase.length === 0 || passphrase.trim().length === 0;
}

/** Stable serialization of the header fields bound as GCM AAD. */
function canonicalHeader(header: {
  format: string;
  version: number;
  kdf: string;
  cipher: string;
  kdfParams: ConfigEnvelope["kdfParams"];
}): string {
  return JSON.stringify({
    format: header.format,
    version: header.version,
    kdf: header.kdf,
    kdfParams: {
      t: header.kdfParams.t,
      m: header.kdfParams.m,
      p: header.kdfParams.p,
      dkLen: header.kdfParams.dkLen,
      salt: header.kdfParams.salt,
    },
    cipher: header.cipher,
  });
}

// --- public API ------------------------------------------------------------

export interface EncryptOptions {
  kdfParams?: Argon2Params;
  schemaVersion?: number;
  appVersion?: string;
  createdAt?: string;
}

export function isBlob(value: unknown): boolean {
  return typeof value === "string" && value.trim().startsWith(BLOB_PREFIX);
}

/**
 * Encrypt a config payload into a pasteable `ODB1.<base64url(envelope)>` blob.
 */
export async function encryptConfig(
  payload: Record<string, unknown>,
  passphrase: string,
  options: EncryptOptions = {},
): Promise<string> {
  if (isEmptyPassphrase(passphrase)) {
    throw new ConfigCryptoError("EMPTY_PASSPHRASE", "A passphrase is required.");
  }

  const params = options.kdfParams ?? defaultKdfParams();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);

  const kdfParams = { t: params.t, m: params.m, p: params.p, dkLen: params.dkLen, salt: bytesToBase64url(salt) };
  const header = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    kdf: KDF_ID,
    kdfParams,
    cipher: CIPHER_ID,
  };

  const key = argon2id(utf8Encode(passphrase), salt, {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  });
  const aad = utf8Encode(canonicalHeader(header));
  const plaintext = utf8Encode(JSON.stringify(payload));
  const ciphertext = gcm(key, iv, aad).encrypt(plaintext);

  const envelope: ConfigEnvelope = {
    ...header,
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(ciphertext),
    schemaVersion: options.schemaVersion ?? 0,
    appVersion: options.appVersion ?? "",
    createdAt: options.createdAt ?? new Date().toISOString(),
  };

  return BLOB_PREFIX + bytesToBase64url(utf8Encode(JSON.stringify(envelope)));
}

/**
 * Parse and structurally validate a blob without decrypting it. Throws
 * `ConfigCryptoError` with a specific code on any malformed input.
 */
export function parseBlob(blob: string): ConfigEnvelope {
  if (typeof blob !== "string") {
    throw new ConfigCryptoError("BAD_FORMAT", "Expected an exported config string.");
  }
  const trimmed = blob.trim();
  if (!trimmed.startsWith(BLOB_PREFIX)) {
    throw new ConfigCryptoError("BAD_FORMAT", `Expected a blob starting with "${BLOB_PREFIX}".`);
  }
  const body = trimmed.slice(BLOB_PREFIX.length);
  if (!body) {
    throw new ConfigCryptoError("BAD_FORMAT", "The exported config is empty.");
  }

  let decoded: string;
  try {
    decoded = utf8Decode(base64urlToBytes(body));
  } catch {
    throw new ConfigCryptoError("BAD_FORMAT", "The exported config is not valid base64url.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new ConfigCryptoError("BAD_ENVELOPE", "The exported config is not valid JSON.");
  }

  return validateEnvelope(parsed);
}

function validateEnvelope(parsed: unknown): ConfigEnvelope {
  if (!isPlainObject(parsed)) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "The exported config has an unexpected shape.");
  }

  const { format, version, kdf, kdfParams, cipher, iv, ciphertext, schemaVersion, appVersion, createdAt } =
    parsed as Record<string, unknown>;

  if (format !== ENVELOPE_FORMAT) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Unknown config format.");
  }
  if (!isInt(version) || version < 1) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid config version.");
  }
  if (version > ENVELOPE_VERSION) {
    throw new ConfigCryptoError(
      "UNSUPPORTED_VERSION",
      "This config was exported by a newer version of OpenDocBot.",
    );
  }
  if (kdf !== KDF_ID || cipher !== CIPHER_ID) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Unsupported encryption algorithm.");
  }

  if (!isPlainObject(kdfParams)) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Missing key derivation parameters.");
  }
  const { t, m, p, dkLen, salt } = kdfParams as Record<string, unknown>;
  if (!isInt(t) || !isInt(m) || !isInt(p) || !isInt(dkLen)) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid key derivation parameters.");
  }
  if (!within(t, BOUNDS.t) || !within(m, BOUNDS.m) || !within(p, BOUNDS.p) || dkLen !== DKLEN) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Key derivation parameters are out of range.");
  }
  if (typeof salt !== "string") {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Missing key derivation salt.");
  }

  let saltLen: number;
  try {
    saltLen = base64urlToBytes(salt).length;
  } catch {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid key derivation salt.");
  }
  if (saltLen < 16 || saltLen > 64) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid key derivation salt length.");
  }

  if (typeof iv !== "string") {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Missing initialization vector.");
  }
  try {
    if (base64urlToBytes(iv).length !== IV_BYTES) {
      throw new Error("bad iv");
    }
  } catch {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid initialization vector.");
  }

  if (typeof ciphertext !== "string") {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Missing ciphertext.");
  }
  try {
    if (base64urlToBytes(ciphertext).length < GCM_TAG_BYTES) {
      throw new Error("short ciphertext");
    }
  } catch {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid ciphertext.");
  }

  if (!isInt(schemaVersion) || schemaVersion < 0) {
    throw new ConfigCryptoError("BAD_ENVELOPE", "Invalid schema version.");
  }

  return {
    format: ENVELOPE_FORMAT,
    version,
    kdf: KDF_ID,
    kdfParams: { t, m, p, dkLen, salt },
    cipher: CIPHER_ID,
    iv,
    ciphertext,
    schemaVersion,
    appVersion: typeof appVersion === "string" ? appVersion : "",
    createdAt: typeof createdAt === "string" ? createdAt : "",
  };
}

export interface DecryptResult {
  payload: Record<string, unknown>;
  envelope: ConfigEnvelope;
}

/**
 * Decrypt a blob into its raw config payload. Throws `WRONG_PASSPHRASE` when the
 * passphrase is wrong or the blob was tampered with.
 */
export async function decryptConfig(blob: string, passphrase: string): Promise<DecryptResult> {
  if (isEmptyPassphrase(passphrase)) {
    throw new ConfigCryptoError("EMPTY_PASSPHRASE", "A passphrase is required.");
  }

  const envelope = parseBlob(blob);
  const salt = base64urlToBytes(envelope.kdfParams.salt);

  const key = argon2id(utf8Encode(passphrase), salt, {
    t: envelope.kdfParams.t,
    m: envelope.kdfParams.m,
    p: envelope.kdfParams.p,
    dkLen: envelope.kdfParams.dkLen,
  });

  const aad = utf8Encode(canonicalHeader(envelope));
  const iv = base64urlToBytes(envelope.iv);
  const ciphertext = base64urlToBytes(envelope.ciphertext);

  let plaintext: Uint8Array;
  try {
    plaintext = gcm(key, iv, aad).decrypt(ciphertext);
  } catch {
    throw new ConfigCryptoError(
      "WRONG_PASSPHRASE",
      "Wrong passphrase, or the exported config was corrupted.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(plaintext));
  } catch {
    throw new ConfigCryptoError("DECRYPT_FAILED", "The decrypted config is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new ConfigCryptoError("DECRYPT_FAILED", "The decrypted config has an unexpected shape.");
  }

  return { payload: parsed, envelope };
}
