---
title: Providers
description: Set up OpenAI, DeepSeek, Anthropic, Gemini, Ollama, OpenRouter, OpenCode Zen, or any OpenAI-compatible endpoint in OpenDocBot.
---

# Providers

OpenDocBot is **provider-agnostic**. Different providers are implementations of the same
`LLMProvider` interface:

| Provider | Handles | Underlying protocol |
|---|---|---|
| `OpenAICompatibleProvider` | OpenAI, DeepSeek, Ollama, OpenRouter, OpenCode, Custom | Responses API + `/chat/completions` |
| `AnthropicProvider` | Claude | Messages API (`/v1/messages`) |
| `GeminiProvider` | Google Gemini | `generateContent` / `streamGenerateContent` |

A **preset** binds a provider to a concrete endpoint and default model. This ensures easy connection to different AI platforms. You can also configure a provider manually via the **Custom** preset.

Below is how to set up each preset, including where to get the API key.

---

## OpenAI

**Setup:**

1. Preset: **OpenAI**
2. Create a key at **https://platform.openai.com/api-keys**
3. Paste, **Test Connection**, **Apply**

---

## Anthropic Claude

**Setup:**

1. Preset: **Anthropic Claude**
2. Create a key at **https://console.anthropic.com/settings/keys**
3. Paste, **Test Connection**, **Apply**
4. Optionally tune **Prompt Caching** in Advanced (TTL 5m vs 1h)

---

## Google Gemini

**Setup:**

1. Preset: **Google Gemini**
2. Create a key at **https://aistudio.google.com/apikey**
3. Paste, **Test Connection**, **Apply**
4. Optionally tune **Prompt Caching** in Advanced (enable + rebuild size)

::: tip Model list
Gemini models are fetched from `/models` and filtered to `gemini*` (thinking
variants like `-thinking` are skipped from the dropdown, but you can type one
manually if you want it).
:::

---

## DeepSeek

**Setup:**

1. Preset: **DeepSeek**
2. Create a key at **https://platform.deepseek.com/api_keys**
3. Paste, **Test Connection**, **Apply**

---

## Ollama

Run a model locally with no API key and no data leaving your premises.

**Prerequisites:**

- [Ollama](https://ollama.com) installed and running (`ollama serve`)
- At least one model pulled, e.g. `ollama pull llama3.1`

**Setup:**

1. Preset: **Ollama**
2. Adjust the endpoint in case it's needed. The default endpoint is `http://localhost:11434/v1`
3. No key required; the field is hidden
4. Type your model name (the model list isn't auto-fetched for Ollama); e.g. `llama3.1`
5. **Test Connection**, **Apply**

::: tip 
If Ollama rejects the request, enable **Use old /chat/completions endpoint** in
Settings → Advanced; some Ollama versions don't implement the Responses API
(`/responses`).
:::

::: warning Browser CORS
OpenDocBot runs in the browser, so requests to Ollama must come from an origin
the Ollama server allows. Ollama only accepts the origins listed in the
`OLLAMA_ORIGINS` environment variable (default: `localhost,127.0.0.1,0.0.0.0`).

The Office taskpane loads the add-in as a page from a specific URL, and all
requests to Ollama are made from that page. So Ollama sees that page's origin,
**not** `localhost`. What to set depends on how the add-in is served:

- **Hosted instance**: the app is served from `https://opendocbot.com/app`, so
  the origin Ollama sees is `https://opendocbot.com`. Restart Ollama with:

```bash
export OLLAMA_ORIGINS="https://opendocbot.com"
ollama serve
```

- **Self-hosted**: use the hostname/IP/domain of your OpenDocBot instance (the
  origin shown in the taskpane's address bar). For example, serving the add-in
  from `https://localhost:3000`:

```bash
export OLLAMA_ORIGINS="https://localhost:3000"
ollama serve
```

You can list multiple origins, comma-separated:
`OLLAMA_ORIGINS="https://opendocbot.com,https://localhost:3000"`.
:::

::: tip Shared, central, or key-protected Ollama server
The default endpoint is `localhost` for a single machine. Ollama can also run
on a shared or central server (it binds `0.0.0.0` and exposes an
OpenAI-compatible `/v1` API). If that's your case, select the **Ollama** preset and change the
**Endpoint URL** to the server's address, e.g. `http://ollama-server:11434/v1`.

If your Ollama server requires an API key (e.g. `OLLAMA_API_KEY` is set),
select the **Custom** preset instead, set the **Endpoint URL** to the Ollama
server's address, and paste the key in the **API Key** field. OpenDocBot sends
it as an `Authorization: Bearer` header, which Ollama validates.
:::

---

## OpenRouter

**Setup:**

1. Preset: **OpenRouter** 
2. Create a key at **https://openrouter.ai/keys**
3. Paste the key, **Test Connection**, **Apply**
4. Pick a model.

::: tip Free models
The "Free models only" checkbox filters the model list to IDs ending in `:free`.
Very handy for trying the add-in at zero cost.
:::

---

## OpenCode Zen

OpenCode Zen is the curated model gateway from OpenCode (the AI coding agent).
It's a solid default for the self-hosted deployment and works out of the box
with a single key.

**Setup:**

1. Open the add-in **Settings**
2. Preset: **OpenCode Zen**
3. Get a key at **https://opencode.ai/auth** 
4. Paste the key, **Test Connection**, **Apply**

::: warning Browser CORS + self-hosted only
OpenCode Zen does **not** allow browser-origin requests. The preset is only available on **self-hosted** deployments, where the proxy functionality can be used. When using the hosted instance the OpenCode Zen preset is **hidden**. See [Compatibility](/docs/compatibility#cors-and-the-proxy) and [Configuration](/docs/configuration#proxy-api-requests-through-this-server).
:::

---

## Custom (any provider)

Custom lets you configure any of the three providers manually with your own
endpoint and API key, instead of using a preset. The **Provider** dropdown
selects the protocol: **OpenAI Compatible** (for any endpoint that speaks
OpenAI's protocol: LiteLLM, Together, Groq, fireworks.ai, local proxies, corporate
gateways, etc.), **Anthropic Claude**, or **Google Gemini**.

**Setup:**

1. Preset: **Custom**
2. **Provider**: OpenAI Compatible (or pick **Anthropic Claude** / **Google Gemini** to point Custom at those)
3. **Endpoint URL**: your base URL, e.g. `https://api.together.xyz/v1`
4. **API key**: as required by the endpoint
5. **Model**: pick from the list or type it manually
6. **Advanced** → toggle **Use old /chat/completions endpoint** if your
   OpenAI-compatible endpoint only supports `/chat/completions`
7. **Test Connection**, **Apply**

::: tip Custom is the escape hatch
If an OpenAI-compatible endpoint behaves oddly, first try toggling the legacy
endpoint option. Most incompatibilities are protocol-level, not model-level.
:::

---

## Prompt caching

Prompt caching lets your provider reuse part of the conversation across turns
instead of reprocessing it, which cuts cost and latency on long chats. Support
depends on the provider:

- **OpenAI, DeepSeek, OpenRouter and OpenCode Zen** cache automatically, so no
  settings are needed. Other OpenAI-compatible endpoints (Ollama, Custom) may or
  may not cache depending on the gateway, and the add-in doesn't control it.
- **Anthropic** caches the system prompt and conversation prefix server-side
  across turns. You can choose a **Cache TTL** (`5m` or `1h`) in Settings.
- **Gemini** keeps a context cache with an automatic rebuild threshold. The
  cache is deleted when the taskpane closes so idle-storage billing stops.

See [Configuration](/docs/configuration#prompt-caching) for the exact settings.

---

## Where keys are stored

Keys live in browser `localStorage` (`opendocbot-settings`). They are sent
directly to the provider and are **never** stored on or transmitted to any
third-party server by the add-in. Clearing browser storage removes them.
