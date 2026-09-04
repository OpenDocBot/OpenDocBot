---
title: Providers
description: Set up OpenAI, DeepSeek, Anthropic, Gemini, Ollama, OpenRouter, or any other provider (e.g. OpenCode) via the Custom preset in OpenDocBot.
---

# Providers

OpenDocBot is **provider-agnostic**. Different providers are implementations of the same
`LLMProvider` interface:

| Provider | Handles | Underlying protocol |
|---|---|---|
| `OpenAICompatibleProvider` | OpenAI, DeepSeek, Ollama, OpenRouter, Custom | Responses API + `/chat/completions` |
| `AnthropicProvider` | Claude | Messages API (`/v1/messages`) |
| `GeminiProvider` | Google Gemini | `generateContent` / `streamGenerateContent` |

A **preset** binds a provider to a concrete endpoint and default model. This ensures easy connection to different AI platforms. You can also configure a provider manually via the **Custom** preset.

Each provider has its own setup guide:

- [OpenAI](/docs/providers/openai)
- [Anthropic Claude](/docs/providers/anthropic)
- [Google Gemini](/docs/providers/gemini)
- [DeepSeek](/docs/providers/deepseek)
- [Ollama](/docs/providers/ollama)
- [OpenRouter](/docs/providers/openrouter)
- [Custom (any provider)](/docs/providers/custom)
- [OpenCode](/docs/providers/opencode)

## Prompt caching

Prompt caching lets your provider reuse part of the conversation across turns
instead of reprocessing it, which cuts cost and latency on long chats. Support
depends on the provider:

- **OpenAI, DeepSeek and OpenRouter** cache automatically, so no
  settings are needed. Other OpenAI-compatible endpoints (Ollama, Custom) may or
  may not cache depending on the gateway, and the add-in doesn't control it.
- **Anthropic** caches the system prompt and conversation prefix server-side
  across turns. You can choose a **Cache TTL** (`5m` or `1h`) in Settings.
- **Gemini** keeps a context cache with an automatic rebuild threshold. The
  cache is deleted when the taskpane closes so idle-storage billing stops.

See [Configuration](/docs/configuration#prompt-caching) for the exact settings.

## Where keys are stored

Keys live in browser `localStorage` (`opendocbot-settings`). They are sent
directly to the provider and are **never** stored on or transmitted to any
third-party server by the add-in. Clearing browser storage removes them.