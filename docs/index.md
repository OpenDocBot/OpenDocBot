---
layout: home

title: "OpenDocBot: Privacy-First Office AI Add-in"
description: Free the Office AI ecosystem. Bring your own LLM into Word, Excel and PowerPoint with OpenDocBot. Client-side, zero-proxy, no lock-in.

hero:
  text: The Office AI agent you can actually trust
  tagline: Client-side, provider-agnostic, and fully auditable. No lock-in. No hidden telemetry.
  actions:
    - theme: brand
      text: View on GitHub
      link: https://github.com/OpenDocBot/OpenDocBot
    - theme: alt
      text: Read the Docs
      link: /docs/quickstart

features:
  - title: Bring Any AI Model
    details: OpenAI, DeepSeek, Anthropic, Gemini, OpenRouter, or local models via Ollama. Use your own keys, swap models on the fly, and avoid vendor lock-in.
  - title: Zero-Trust by Design
    details: 100% client-side. Source and development public on GitHub. No document data ever touches our servers. The app runs completely client-side.
  - title: You Stay in Control
    details: Optional human-in-the-loop approval gate lets you review model proposals before edits are applied. Self-host anytime.
  - title: Word, Excel & PowerPoint
    details: One agent for your entire workflow. Summarize reports in Word, analyze data and write formulas in Excel, and draft slides in PowerPoint.
---

## FAQ

::: details What is OpenDocBot?
OpenDocBot is a 100% client-side, provider-agnostic AI agent for Microsoft Office (Word, Excel, and PowerPoint). It lets you connect your own AI models to draft content, build presentations, analyze data, and perform complex workflows directly by prompting.
:::

::: details How do I install and use OpenDocBot?
The easiest way to get started is by following our [Quickstart Guide](/docs/quickstart).
:::

::: details Do I need a paid subscription or API key to use OpenDocBot?
OpenDocBot follows a Bring Your Own Key (BYOK) model. You need an API key or endpoint from any supported provider (such as OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter) or a local runner like Ollama. Your data goes directly to the configured provider and never reaches our servers. See the [Providers documentation](/docs/providers/) for full guides on how to configure each supported provider.
:::

::: details Is OpenDocBot ready to use?
OpenDocBot is currently in Early Access. The product is usable today, but it currently requires sideloading into Microsoft 365 because Marketplace distribution is not available yet. We're actively looking for power users to try it early and help shape the product.
:::

::: details Can I use local models without an internet connection?
Yes. OpenDocBot supports local providers like Ollama or any OpenAI-compatible local server. If your local LLM setup runs fully offline, your entire document processing workflow can remain completely air-gapped. See the [Ollama guide](/docs/providers/ollama) and the [Self-hosting guide](/docs/selfhosting) for details.
:::

::: details Is OpenDocBot free?
OpenDocBot is free for individuals and teams of up to 30 users. If your organization scales past 30 users, a commercial license is required to support the ongoing development of the project. Read our [License Page](/docs/license) for full details.
:::

::: details How are my data and privacy handled?
OpenDocBot is 100% client-side. We do not operate intermediate servers, proxy your requests, or track telemetry. Your document content travels directly from your local machine to the AI provider endpoint you configure.
:::

::: details Can I audit the source code?
Yes. OpenDocBot is **source-available** under a fair-code license. The entire codebase is public on [GitHub](https://github.com/OpenDocBot/OpenDocBot) so you can audit, modify, and self-host it. See the [License Page](/docs/license) for usage terms.
:::

<style>
/* terminal cursor on the landing page */
.VPHomeHero .text::after {
  content: "▊";
  color: var(--vp-c-brand-1);
  animation: blink 1.1s step-end infinite;
  margin-left: 4px;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
/* FAQ: hide the details container chrome, keep only the question text */
details.custom-block.details {
  background: transparent;
  border-color: transparent;
  padding: 0;
}
</style>
