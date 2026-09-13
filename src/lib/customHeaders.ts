/**
 * Custom HTTP headers for the Custom preset.
 *
 * The user defines key/value pairs whose *values* may contain `$VAR` tokens.
 * Tokens are replaced at request time, so providers like OpenCode Go can be
 * given a stable per-conversation session id without the user hardcoding one.
 *
 * Available variables:
 *   $SESSION_ID  stable id for the current conversation (survives reloads,
 *                regenerated on "Clear conversation")
 *   $RANDOM      a fresh UUID per request
 *   $TIMESTAMP   Unix milliseconds of the request
 *   $MODEL       the configured model
 *   $HOST        the Office host: "word" | "excel" | "powerpoint"
 *   $VERSION     the add-in version
 *   $BASE_URL    the configured endpoint
 */

import { getSessionId } from "./chatSession";
import { getHost } from "../office";
import { APP_VERSION } from "./buildInfo";

export const HEADER_VARIABLES = [
  "SESSION_ID",
  "RANDOM",
  "TIMESTAMP",
  "MODEL",
  "HOST",
  "VERSION",
  "BASE_URL",
] as const;

export interface HeaderResolveOptions {
  model?: string;
  baseUrl?: string;
}

function buildVariableValues(
  opts: HeaderResolveOptions
): Record<string, string> {
  return {
    SESSION_ID: getSessionId(),
    RANDOM: crypto.randomUUID(),
    TIMESTAMP: String(Date.now()),
    MODEL: opts.model ?? "",
    HOST: getHost(),
    VERSION: APP_VERSION,
    BASE_URL: opts.baseUrl ?? "",
  };
}

/** Valid HTTP header name (RFC 7230 token), same rule the proxy uses. */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Resolve `$VAR` tokens in every header value. Empty keys, invalid header
 * names, and values that are empty either as written or after resolving to an
 * empty string are dropped. Unknown tokens are left untouched.
 */
export function resolveCustomHeaders(
  raw: Record<string, string> | undefined,
  opts: HeaderResolveOptions = {}
): Record<string, string> {
  if (!raw) return {};
  const values = buildVariableValues(opts);

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = key.trim();
    if (!name || !HEADER_NAME_RE.test(name)) continue;
    if (!value.trim()) continue;
    const resolved = value.replace(
      /\$([A-Z_]+)/g,
      (match, name: string) => values[name] ?? match
    );
    if (!resolved.trim()) continue;
    out[name] = resolved;
  }
  return out;
}

/**
 * Merge resolved custom headers under provider headers: the provider's own
 * headers (Authorization, x-api-key, ...) always win, so a user cannot
 * accidentally break authentication.
 */
export function withCustomHeaders(
  providerHeaders: Record<string, string>,
  raw: Record<string, string> | undefined,
  opts: HeaderResolveOptions = {}
): Record<string, string> {
  return { ...resolveCustomHeaders(raw, opts), ...providerHeaders };
}