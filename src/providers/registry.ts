import type { LLMProvider } from "./types";
import { OpenAICompatibleProvider } from "./openai";
import { GeminiProvider } from "./gemini";
import { AnthropicProvider } from "./anthropic";

const registry = new Map<string, LLMProvider>();

function register(provider: LLMProvider): void {
  registry.set(provider.id, provider);
}

register(
  new OpenAICompatibleProvider(
    "openaicompat",
    "OpenAI Compatible",
    false,
    ""
  )
);

register(new AnthropicProvider());

register(new GeminiProvider());

export function getProvider(id?: string): LLMProvider {
  if (id) return registry.get(id) ?? registry.values().next().value!;
  return registry.values().next().value!;
}

export function listProviders(): LLMProvider[] {
  return Array.from(registry.values());
}
