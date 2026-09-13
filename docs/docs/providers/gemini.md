---
title: Google Gemini
description: Connect OpenDocBot to Google Gemini. Create an API key, pick the preset, tune prompt caching.
---

# Google Gemini

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

<iframe width="600" height="337"
  src="https://www.youtube-nocookie.com/embed/FZs6R7xsvA8"
  title="OpenDocBot Connecting Google Gemini"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen loading="lazy"></iframe>

See [Configuration](/docs/configuration#prompt-caching) for the caching settings.