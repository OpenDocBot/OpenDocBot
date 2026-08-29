---
title: Configuration
description: Every OpenDocBot setting explained. Presets, API keys, custom instructions, prompt caching, reasoning, and the proxy option.
---

# Configuration

All settings live in the add-in's **Settings** panel (gear icon) and are stored
locally in your browser via `localStorage`. No telemetry.

The panel has two tabs:

- **Connection**: provider, endpoint, key, model, advanced options, test
- **Behavior**: custom instructions, Human in the Loop

## Custom Instructions

A free-form text box in the **Behavior** tab. Whatever you write is injected
into the agent's **system prompt on every turn**, so it applies persistently to
the whole conversation, not just the next message.

- They are stored locally with your other settings (`localStorage`) and survive
  reloads.
- They are sent to the provider as part of the system prompt, alongside the
  built-in rules. **Your custom instructions take precedence over any
  conflicting built-in rules.**
- Editing them mid-conversation takes effect from the next message: providers
  with content-keyed caches (Anthropic, OpenAI, OpenCode Zen) adapt
  automatically, and Gemini invalidates its context cache when the system
  prompt changes.
- Clear the field and press **Apply** to remove them.

Example:

> Always write in British English. Use a formal tone. Never change the
> document's heading structure.

## Human in the Loop

When enabled, every **document-modifying** tool call pauses for your approval
before it runs. Useful for anything you can't easily undo. See
[Features](/docs/features#human-in-the-loop) for details.

## Presets

A preset is a one-click bundle of `providerId + endpoint + default model +
advanced configuration`. The Preset selector appears at the top of the
Connection tab.

| Preset | Provider | Endpoint | Default model | Key required |
|---|---|---|---|---|
| **OpenAI** | OpenAI-compatible | `https://api.openai.com/v1` | `gpt-5.6-luna` | Yes |
| **DeepSeek** | OpenAI-compatible | `https://api.deepseek.com` | `deepseek-v4-flash` | Yes |
| **Anthropic Claude** | Anthropic | `https://api.anthropic.com/v1` | `claude-haiku-4-5` | Yes |
| **Google Gemini** | Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-3.5-flash-lite` | Yes |
| **Ollama** | OpenAI-compatible | `http://localhost:11434/v1` | `llama3.1` | No |
| **OpenRouter** | OpenAI-compatible | `https://openrouter.ai/api/v1` | `openai/gpt-4o` | Yes |
| **OpenCode Zen**¹ | OpenAI-compatible | `https://opencode.ai/zen/go/v1` | `deepseek-v4-flash` | Yes |
| **Custom** | OpenAI-compatible / Anthropic / Gemini | _Custom_ | _Custom_ | Optional |

¹ **OpenCode Zen only appears on self-hosted / dev deployments.** See [here](/docs/compatibility#cors-and-the-proxy).

Selecting a preset fills in the endpoint and model, clears the API key, and sets
the proxy flag from the preset (on for OpenCode Zen, off for the rest). When the
preset is **Custom**, an extra **Provider** dropdown appears so you can pick the
provider type (`OpenAI Compatible`, `Google Gemini`, `Anthropic Claude`) before
configuring the endpoint.

## Endpoint URL

The base URL of the provider, without trailing slash. Examples:

- `https://opencode.ai/zen/go/v1`
- `https://api.openai.com/v1`
- `http://localhost:11434/v1`

The add-in appends `/responses`, `/chat/completions`, `/messages`, or the
Gemini method path automatically, depending on provider and endpoint flavor.

## API key

Only shown when the selected preset requires one. Stored in browser
`localStorage`, sent directly to the provider in request headers. **Never sent
anywhere else**.

## Model

The Model dropdown automatically loads available models from the provider's `/models`
endpoint (when a key is present and the provider supports it). 

This request
respects the [proxy setting](/docs/configuration#proxy-api-requests-through-this-server): with "Proxy API requests through this server"
on, the `/models` call also goes through the proxy, so providers without browser
CORS load their model list. 

It could happen that the `/models` endpoint isn't reachable, or the provider
needs no API key (e.g. Ollama) If for any reason the model list can not be obtained, a free-text input appears so you can type the model name. 

For the **OpenRouter** preset, a **Free models only** filter narrows the list to
`:free` models.

## Advanced

Collapsed by default. Contains:

### Max Tokens

The maximum number of tokens the model may produce per response (default 8192).
Applies to both reasoning and answer combined. If a reply is cut off because it
reached this limit, the add-in shows a truncation notice:

> "The model's reply was cut off because it reached the output token limit.
> Increase Max Tokens in Settings and try again."

If this happens, raise this value and try again.

### Use old /chat/completions endpoint

Available for OpenAI-compatible providers (not Gemini/Anthropic).

- **Off (default)**: uses the Responses API (`/responses`).
- **On**: uses the legacy `/chat/completions` endpoint.

Enable this only if your endpoint doesn't support `/responses` (for example,
some Ollama setups or older gateways).

### Reasoning Effort

Controls how much the model thinks before answering. It's a free-form text
field; blank (default) means don't send anything and use the provider's default.

Supported values are provider/model-specific. Setting an effort a model doesn't support will make the request fail. You can
use **Test Connection** to check whether your provider accepts the value before
applying it.

### Prompt Caching

The available caching settings depend on the provider you're using.

For **Anthropic**, you can set the **Cache TTL**: `5m` (default) refreshes for
free within active bursts, while `1h` survives longer pauses but cache writes
cost **2×**.

For **Gemini**, you can toggle **Enable Prompt Caching** to turn the context
cache on or off, and set **Cache rebuild size (tokens)** to rebuild the cache
when the conversation grows past that many tokens (default 2000, min 1024).
Caching only happens when the prompt is large enough to be worthwhile.

For **OpenAI, DeepSeek, OpenRouter and OpenCode Zen**, caching happens
automatically, so no settings are needed.

### Proxy API requests through this server

Available in **Advanced** on self-hosted / dev deployments (the build flag
`VITE_PROXY_ENABLED` controls it; GitHub Pages builds ship without it).

When enabled, provider calls are rewritten to a same-origin
`/proxy/<encoded-baseUrl>/<path>` endpoint instead of calling the provider
directly. The serving process forwards the request server-to-server.

**Use it for providers that don't allow browser-origin requests**, most notably
**OpenCode Zen**. 

## Connection test

**Test Connection** sends a tiny request (`maxTokens: 10`) to the configured
endpoint and reports latency or the exact error. Useful for validating keys and
endpoints before starting work.

## Apply / Clean

Settings are drafts until you press **Apply**. **Clean** discards your edits and
reloads the stored configuration.
