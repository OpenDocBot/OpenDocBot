---
title: OpenRouter
description: Connect OpenDocBot to OpenRouter, including free models. Create an API key, pick the preset, choose a model.
---

# OpenRouter

**Setup:**

1. Preset: **OpenRouter**
2. Create a key at **https://openrouter.ai/keys**
3. Paste the key, **Test Connection**, **Apply**
4. Pick a model.

::: tip Free models
The "Free models only" checkbox filters the model list to IDs ending in `:free`.
Very handy for trying the add-in at zero cost.
:::

<iframe width="600" height="337"
  src="https://www.youtube-nocookie.com/embed/rFmtoiN6VjM"
  title="OpenDocBot Connecting OpenRouter"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen loading="lazy"></iframe>

::: tip Inference region (Sovereign AI)
With the **OpenRouter** preset active, the **Advanced** settings show an
"Inference region" selector with **Global**, **EU** and **US** options.

* **Global** uses the standard `https://openrouter.ai` endpoint.
* **EU** and **US** use the in-region endpoints `https://eu.openrouter.ai`
  and `https://us.openrouter.ai`, so prompts and completions are processed
  entirely inside that region and never leave it.

Switching region also reloads the model list from that region's endpoint.
In-region routing requires a **Business** or **Enterprise** OpenRouter plan.
:::

Prompt caching is handled automatically by OpenRouter; no settings needed. See
[Prompt caching](/docs/providers/#prompt-caching).