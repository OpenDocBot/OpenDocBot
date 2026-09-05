---
layout: home

title: "OpenDocBot: Privacy-First Office AI Add-in"
description: Free the Office AI ecosystem. Bring your own LLM into Word, Excel and PowerPoint with OpenDocBot. Client-side, zero-proxy, no lock-in.

hero:
  text: Free the Office AI ecosystem
  tagline: The client-side, provider-agnostic M365 AI agent. No lock-in, no hidden telemetry.
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
  - title: Word, Excel & PowerPoint
    details: One plugin for your entire workflow. Summarize reports in Word, analyze data and write formulas in Excel, and draft slides in PowerPoint.
  - title: Zero-Trust Privacy
    details: 100% client-side. Source and development public on GitHub. No document data ever touches our servers. The app runs completely client-side in your browser/Office.
  - title: Total Control & Safety
    details: Optional human-in-the-loop approval gate lets you review model proposals before edits are applied. Self-host anytime.
---

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
</style>
