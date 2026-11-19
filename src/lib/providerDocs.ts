const DOCS_BASE = "https://opendocbot.com/docs/providers";

export const PROVIDER_DOCS_INDEX = `${DOCS_BASE}/`;

const PROVIDER_DOC_SLUGS: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  deepseek: "deepseek",
  bedrock: "bedrock",
  foundry: "foundry",
  ollama: "ollama",
  openrouter: "openrouter",
  custom: "custom",
  opencode: "opencode",
};

export function getProviderDocsUrl(presetId?: string | null): string {
  const slug = presetId ? PROVIDER_DOC_SLUGS[presetId] : undefined;
  return slug ? `${DOCS_BASE}/${slug}` : PROVIDER_DOCS_INDEX;
}
