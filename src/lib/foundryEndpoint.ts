/**
 * Helpers for the Microsoft Foundry preset.
 *
 * Foundry exposes an OpenAI-compatible v1 API under `/openai/v1` on both the
 * `*.services.ai.azure.com` (Foundry / AI Services) and `*.openai.azure.com`
 * (classic Azure OpenAI) resource endpoints. The endpoint is resource-specific,
 * so users paste it in the Endpoint field, and the portal's copy button gives
 * many shapes: the resource root, `/models`, `/models/chat/completions`, or a
 * full `/openai/v1/chat/completions?api-version=...` URL.
 *
 * On those resources the v1 base is *always* `https://<origin>/openai/v1`, so
 * normalization simply reduces any such URL to that base. The model field is
 * the deployment name, not something derived from the URL.
 */

/** Hosts that serve the Azure AI Foundry / Azure OpenAI v1 API. */
const FOUNDRY_HOST_RE = /\.(services\.ai\.azure\.com|openai\.azure\.com)$/i;

/** The OpenAI-compatible path every Foundry/Azure OpenAI resource exposes. */
const V1_SEGMENT = "/openai/v1";

/** True when the URL host belongs to Azure AI Foundry / Azure OpenAI. */
export function isFoundryHost(url: string): boolean {
  try {
    return FOUNDRY_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Reduce a pasted Foundry endpoint to the canonical v1 base
 * (`https://<origin>/openai/v1`), whatever path or query it carries. Non-Azure
 * values are returned trimmed but otherwise untouched.
 */
export function normalizeFoundryEndpoint(raw: string): string {
  const value = raw.trim();
  if (!value || !isFoundryHost(value)) return value;
  try {
    const { origin } = new URL(value);
    return `${origin}${V1_SEGMENT}`;
  } catch {
    return value;
  }
}

/**
 * True when the value is a usable Foundry v1 base endpoint: an HTTPS URL on an
 * Azure Foundry / Azure OpenAI host with the `/openai/v1` path.
 */
export function isFoundryEndpoint(value: string): boolean {
  const normalized = normalizeFoundryEndpoint(value);
  return /^https:\/\/.+\/openai\/v1$/i.test(normalized) && isFoundryHost(normalized);
}
