import { randomBytes } from "@noble/hashes/utils.js";
import { bytesToBase64url } from "./configCrypto";

/**
 * Passphrase helpers for encrypted config export. Generated passphrases use the
 * native CSPRNG via noble's `randomBytes`, so they are safe everywhere the
 * add-in runs. Users can also type their own; only empty/whitespace-only input
 * is rejected.
 */

/** Generate a random base64url passphrase (24 bytes = 192 bits by default). */
export function generatePassphrase(bytes = 24): string {
  return bytesToBase64url(randomBytes(bytes));
}

/** A passphrase must be a non-empty, non-whitespace string. */
export function isUsablePassphrase(passphrase: unknown): boolean {
  return typeof passphrase === "string" && passphrase.trim().length > 0;
}

export type PassphraseStrength = "weak" | "ok" | "strong";

/** Coarse strength hint for the UI. Never used for enforcement beyond non-empty. */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  if (!isUsablePassphrase(passphrase)) return "weak";
  const length = passphrase.trim().length;
  if (length >= 24) return "strong";
  if (length >= 12) return "ok";
  return "weak";
}
