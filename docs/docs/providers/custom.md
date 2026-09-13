---
title: Custom (any provider)
description: Configure any provider manually in OpenDocBot. Pick the protocol, point it at an endpoint, enable the proxy if needed.
---

# Custom (any provider)

Custom lets you configure any of the three providers manually instead of using
a preset. The **Provider** dropdown selects the protocol: **OpenAI Compatible**
(LiteLLM, Together, Groq, etc.), **Anthropic Claude**, or **Google Gemini**.

Providers without a preset, such as [OpenCode](/docs/providers/opencode), are
configured this way: pick the **Provider** whose protocol matches the model,
point it at the right endpoint, and enable the proxy when the provider blocks
browser requests.

::: tip Custom is the escape hatch
If an OpenAI-compatible endpoint behaves oddly, first try toggling the legacy
endpoint option. Most incompatibilities are protocol-level, not model-level.
:::

<!-- Connection video: paste the <iframe> embed here. -->