---
title: Introducing OpenDocBot
description: An open interface for agentic Office. Use the AI models and keys you already have, without another license and no vendor lock-in.
date: "2026-11-02"
sidebar: false
outline: false
prev: false
next: false
---

# Introducing OpenDocBot

An open interface for agentic Office in Word, Excel and PowerPoint. Use the **models and keys you already have**, without another license.

By OpenDocBot · November 2, 2026

[Back to all posts](/blog/)

Most organizations already pay for AI. They hold API keys with a model provider, a contract with a cloud platform, or a local model running on their own servers. When the work happens in Word, Excel or PowerPoint, though, the AI feature usually arrives as **another per-user license**, tied to one model and one vendor.

Today we are releasing OpenDocBot, an **open interface for agentic Office**. It runs in the Office task pane, connects to the models you already use, and **adds no per-seat fee**. You bring your own models and keys, you choose where it runs, and you can change providers without changing how your team works.

<div class="blog-demo">
  <HeroDemo initial="excel" :show-tabs="false" />
</div>

OpenDocBot is [source-available](https://github.com/OpenDocBot/OpenDocBot). You can read the code that handles your documents, run it on your own infrastructure, and connect the keys you already have. Requests go from the machine running Office straight to the provider you configure. **Document content never reaches our servers.**

## Connect the models you already pay for

OpenDocBot works with OpenAI, Anthropic, Google Gemini, DeepSeek, Amazon Bedrock, Microsoft Foundry, OpenRouter, Ollama and any OpenAI-compatible endpoint. If your company already has an agreement with one of them, you use the credentials you have. If you are already paying for a subscription, you can use it. **AI usage is billed directly by your provider**, so there is no OpenDocBot charge for model access. Switching providers is a settings change.

For teams that need more control, OpenDocBot can be self-hosted. The self-hosted instance includes extra features like **SSO, managed configuration**. Security and IT teams can review the source before deployment.

<div class="blog-demo">
  <HeroDemo initial="provider" :show-tabs="false" />
</div>

## Portable by design

We call it an open interface because the parts that matter to you stay open. You can read the code, choose any supported model, export your skills as **SKILL.md files**, and connect external tools through **MCP**. Changing models or providers should not mean relearning the tool or rebuilding your skills and connections.

To be precise about the word open: OpenDocBot is source-available under a **fair-code license**. That is different from OSI open source. The [license page](/docs/license) explains what you can and cannot do with it.

## An agent that works inside the document

OpenDocBot reads the current structure of the document and applies changes through the Office.js APIs. In Word it can edit text, lists and formatting. In Excel it can read and write ranges, sort data or build custom plots. In PowerPoint it can build full slide decks. It can also read the files you attach, including scanned PDFs through local OCR and content extraction.

For example, you can ask it to clean up a messy Excel table, sort it, format the headers and plot the result. With **approval turned on**, every action that modifies the document pauses until you confirm it.

Suggestion mode makes content editing read-only. In Word and Excel, the agent leaves review comments for you to apply. It is not available in PowerPoint.

<div class="blog-demo">
  <HeroDemo initial="hitl" :show-tabs="false" />
</div>

## Available today

OpenDocBot is available in the Microsoft Marketplace for Microsoft 365 on desktop and web. Perpetual versions of Office (2016, 2019 and 2021) are not supported.

Individuals and teams of **up to 30 users can use it for free**, including self-hosting, SSO and managed configuration.

[**Install from the Microsoft Marketplace**](https://marketplace.microsoft.com/en-us/product/WA200012650?tab=Overview)

Other ways to start: [read the quickstart](/docs/quickstart), [review the source on GitHub](https://github.com/OpenDocBot/OpenDocBot), or [book a 20-minute intro](/enterprise).

## What comes next

We are publishing this blog to share product updates, deployment guides, case studies and notes from building an open interface for agentic Office. The next posts cover provider setup, self-hosting, SSO and managed configuration, and how to estimate what agentic Office costs on the model contracts you already have.

If you have a workflow you want OpenDocBot to handle first, tell us at [hello@opendocbot.com](mailto:hello@opendocbot.com) or [open an issue on GitHub](https://github.com/OpenDocBot/OpenDocBot/issues).
