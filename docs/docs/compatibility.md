---
title: Compatibility
description: Office hosts and versions, provider feature matrix, and CORS / proxy notes for OpenDocBot.
---

# Compatibility

OpenDocBot is a single add-in that runs in **Word, Excel and PowerPoint**.
One add-in, all three apps, no separate installs.

## Is your Office version supported?

| Platform | Support |
|---|---|
| **Microsoft 365** (desktop) | ✅ Fully supported |
| **Microsoft 365** (web) | ✅ Fully supported |
| Office 2016/2019/2021 (perpetual) | ❌ Not supported |
| LibreOffice / Google Docs | ❌ Not supported |


### Required API sets (for IT administrators)

OpenDocBot targets **Word, Excel, and PowerPoint**. Because each host exposes
different API sets, host-specific sets (`WordApi`, `ExcelApi`, `PowerPointApi`)
are **not** declared globally in the manifest. They're checked at runtime per
host with `isSetSupported`. The only global requirement in the manifest is the
shared runtime:

| API set | Min version | Used for |
|---|---|---|
| `SharedRuntime` | 1.1 | Persistent taskpane runtime |

At runtime the add-in requires, per host:

| Host | API set | Min version |
|---|---|---|
| Word | `WordApi` | 1.3 |
| Excel | `ExcelApi` | 1.1 |
| PowerPoint | `PowerPointApi` | 1.4 |

::: warning Advanced PowerPoint editing needs 1.8
Most PowerPoint features work with `PowerPointApi 1.4`, but advanced slide
editing requires **`PowerPointApi 1.8`**. Current-channel Microsoft 365 has it.
If an advanced editing tool fails, check your channel version.
:::

## AI Provider compatibility

OpenDocBot is modular and supports several AI providers. Under the hood there
are **three providers**: **OpenAI-compatible** (used by OpenAI, DeepSeek,
Ollama, OpenRouter and any Custom OpenAI-compatible endpoint), **Anthropic** (Claude), and
**Gemini** (Google).

A **preset** is just a shortcut: a provider bound to a specific endpoint and configurations. Several presets share the same provider (for example, Ollama and
OpenRouter both use the OpenAI-compatible provider). Because presets reuse
providers, you can switch between them without changing anything else.

Not all features are available with every provider.

### Feature matrix

| Feature | OpenAI | DeepSeek | Anthropic | Gemini | Ollama | OpenRouter | 
|---|---|---|---|---|---|---|
| Reasoning | ✅ | ✅ | ✅ | ✅ | ✅\* | ✅\* | 
| Reasoning effort | ✅ | ✅ | ✅ | ✅ | ❌\*\* | ⚠️\*\* | 
| Token streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 
| Prompt caching | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cache TTL options | - | - | 5m / 1h | rebuild size | - | - |
| Legacy `/chat/completions` toggle | ✅ | ✅ | n/a | n/a | ✅ | ✅ |
| Model list fetching | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

\* Reasoning availability depends on the underlying model; an endpoint only
surfaces reasoning if the model emits it (e.g. `reasoning_content` for
DeepSeek-style models).

\*\* Reasoning effort depends on the model and endpoint. OpenAI/Anthropic/Gemini
send it natively; Ollama ignores it, and OpenRouter forwards it to
the routed model, which may or may not support it.

### Notes

- The **Ollama** preset needs no API key, so the model name is typed manually. If Ollama
  rejects requests, toggle **Use old /chat/completions endpoint** in Advanced
  (some versions don't support `/responses`).
- The **Gemini** provider supports context caching with a configurable rebuild threshold (default 2000 tokens);
  the cache is deleted on taskpane close to stop idle-storage billing.
- The **OpenRouter** preset lets you filter the model list to show only `:free` models, so
  you can use the add-in at no cost.

## CORS and the proxy

The add-in runs in your browser (the Office taskpane is a webview), so it can
only reach providers that allow browser-origin requests (CORS). 

To connect to providers not supporting CORS (e.g. OpenCode), a request
proxying functionality was added. This functionality is only available on
self-hosted instances (see [Self-hosting](/docs/selfhosting)). OpenCode has
no preset; configure it through the **Custom** preset with the proxy enabled
(see [OpenCode](/docs/providers/opencode)).

| Provider | Hosted instance | Self-hosted |
|---|---|---|
| OpenAI | ✅ | ✅ |
| DeepSeek | ✅ | ✅ |
| Anthropic | ✅ | ✅ |
| Gemini | ✅ | ✅ |
| Ollama | ✅ (any endpoint) | ✅ |
| OpenRouter | ✅ | ✅ |
| **OpenCode** | ❌ | ✅ (via proxy) |

Request proxying can be turned ON/OFF via Settings → Connection → Advanced →
Proxy API requests through this server. 
