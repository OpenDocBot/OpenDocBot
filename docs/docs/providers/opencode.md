---
title: OpenCode
description: Connect OpenDocBot to OpenCode (Zen or Go). Configure the protocol, endpoint, proxy and x-opencode-session header via the Custom preset.
---

# OpenCode

::: warning Browser CORS + self-hosted only
OpenCode does **not** allow browser-origin requests, so it requires the
proxy, which only exists on **self-hosted** deployments. On the hosted instance
there is no proxy and OpenCode can't be reached. See
[Compatibility](/docs/compatibility#cors-and-the-proxy) and
[Configuration](/docs/configuration#proxy-api-requests-through-this-server).
:::

[OpenCode](https://opencode.ai) offers two access lanes with different pricing
and endpoints:

- **OpenCode Zen**: the pay-per-use gateway. Deposit a balance and pay per
  token; there is no monthly fee. Endpoint: `https://opencode.ai/zen/v1`.
- **OpenCode Go**: the subscription lane. A flat monthly fee with rolling
  usage caps. Endpoint: `https://opencode.ai/zen/go/v1`.

Both lanes expose models through **three different protocols**, so there is no
single preset; configure it per model through the [Custom
preset](/docs/providers/custom) instead. The official model list, including
the endpoint protocol each model expects, lives at <https://opencode.ai/docs/zen/>
for OpenCode Zen and at <https://opencode.ai/docs/go/> for OpenCode Go.

**Setup (self-hosted only):**

1. Preset: **Custom**
2. **Provider**: pick the protocol the model speaks:
   - **OpenAI Compatible** for models served over `/responses` or
     `/chat/completions` (e.g. DeepSeek, GLM, Kimi)
   - **Anthropic Claude** for models served over `/messages` (e.g. Qwen,
     MiniMax)
3. **Endpoint URL**: `https://opencode.ai/zen/v1` (Zen) or
   `https://opencode.ai/zen/go/v1` (Go), base URL only; the provider appends
   the path
4. **API key**: create one at **https://opencode.ai/auth**
5. **Model**: type the model id (e.g. `qwen3.8-max`). If the model list doesn't
   load, a free-text field appears.
6. **Advanced** → enable **Proxy API requests through this server** (OpenCode
   does not allow browser-origin requests)
7. For **OpenAI Compatible** models served over `/chat/completions`, enable
   **Use old /chat/completions endpoint** in Advanced.
8. **Advanced** → **Custom Headers**: add `x-opencode-session` with value
   `$SESSION_ID`.
9. **Test Connection**, **Apply**

<!-- Connection video: paste the <iframe> embed here. -->

::: warning The x-opencode-session header is required
You **must** add the `x-opencode-session: $SESSION_ID` custom header. OpenCode
uses it to identify the conversation and enable prompt caching across your
requests. Without it, requests may fail.
:::
