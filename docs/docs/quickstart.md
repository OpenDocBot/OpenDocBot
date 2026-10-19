---
title: Quickstart
description: Install OpenDocBot from the Microsoft Marketplace, connect your own AI provider, and use it in Word, Excel or PowerPoint.
---

# Quickstart

## What is OpenDocBot?

OpenDocBot is a 100% client-side, provider-agnostic AI agent for Microsoft Office (Word, Excel, PowerPoint). Connect your own API keys from any provider (OpenAI, DeepSeek,
Anthropic, Gemini, Ollama, OpenRouter, OpenCode, or any OpenAI-compatible
endpoint), and the model reads, writes and formats your content directly.

Bring your own keys and models, gate every action behind **human-in-the-loop
approval**, or **self-host** it: your data never has to leave your
infrastructure.

## 1. Install from the Microsoft Marketplace

1. Open **Word**, **Excel** or **PowerPoint**.
2. Go to **Home > Add-ins**.
3. Search for **OpenDocBot** and install it like any other add-in.
4. Pin it to the ribbon for quick access.

You can also install it from its [Microsoft Marketplace listing](https://marketplace.microsoft.com/en-us/product/WA200012650?tab=Overview).

### Requirements

- **Microsoft 365**: Word, Excel or PowerPoint (desktop or web). Perpetual Office 2016/2019/2021 is not supported.
- An LLM provider that allows browser access (see below).

::: tip How it runs
The add-in is served from a public instance at [opendocbot.com/app](https://opendocbot.com/app), but only **once**, when your Office taskpane first loads. After that, everything runs **entirely on your machine** and talks to your AI provider directly. **No document data ever reaches our servers.**
:::

For a central deployment or a self-hosted instance, see [Self-hosting](/docs/selfhosting).

## 2. Connect a provider

1. Open the add-in **Settings** (gear icon)
2. Pick a **Preset**, paste your **API key**
3. **Test Connection**, then **Apply**

<LiteYouTube id="hkTQNekzxUE" title="How to connect OpenDocBot to an AI Provider" />

## 3. Talk to your document

Type a request and press **Enter**; for example, in Word: *"Make the selected
heading green and bold."* Or in PowerPoint: *"Turn this deck into a retro wine
label style."*

---

## Self-hosting

If you want full control, or need the **proxy** for providers without browser
CORS (like OpenCode), you can run OpenDocBot on your own infrastructure. The
full guide (Docker, Node, static hosting, HTTPS/TLS certificates, the proxy,
production manifests, and deploying it to your organization) is on the
[Self-hosting](/docs/selfhosting) page. That page
also covers the team features you get when you self-host:
[SSO](/docs/enterprise/sso) and
[managed configuration](/docs/enterprise/managed-configuration).

---

## Next steps

- [Compatibility](/docs/compatibility): providers, features, Office versions, CORS
- [Configuration](/docs/configuration): every setting explained
- [Features](/docs/features): HITL, prompt caching, reasoning and more
- [Skills](/docs/skills): reusable procedures scoped per Office app
- [MCP](/docs/mcp): connect external tools to the chat
- [Self-hosting](/docs/selfhosting): Docker, the proxy, production manifests
