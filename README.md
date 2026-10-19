[English](README.md) | [简体中文](README.zh-CN.md)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c">
    <img src="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c" alt="OpenDocBot" width="320" />
  </picture>
</p>

<p align="center"><strong>The Office AI agent you can actually trust<br/>Client-side, provider-agnostic, and fully auditable. No lock-in. No hidden telemetry.</strong></p>

<p align="center">
  <a href="https://marketplace.microsoft.com/en-us/product/WA200012650?tab=Overview">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://get.microsoft.com/images/en-us%20dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://get.microsoft.com/images/en-us%20light.svg">
      <img src="https://get.microsoft.com/images/en-us%20light.svg" alt="Get it from Microsoft" height="40">
    </picture>
  </a>
</p>

<br />

Works on **Microsoft 365** (Word, Excel, PowerPoint) on Desktop & Web.

---
## Features

- **Universal Office Suite Integration**: One add-in for Word, Excel, and PowerPoint. Read, write, analyze content, generate formulas, auto-format tables, and build slide decks directly inside your workflow.
- **Provider Freedom & Zero Lock-In**: Connect to OpenAI, Anthropic, Gemini, DeepSeek, Ollama, OpenRouter, OpenCode, or any OpenAI-compatible API. Switch instantly between models and providers.
- **100% Client-Side & Local-First**: Zero telemetry. Your document data goes straight from your browser to your provider, or stays completely offline when paired with **Ollama**.
- **Human-in-the-Loop Safety**: Review and approve model actions before any text, formula, or slide layout is modified in your document.
- **Suggestion Mode**: Read-only review. The agent adds native Word/Excel comments proposing changes instead of editing your content.
- **BYOK & Self-Hostable**: 100% free for individuals and small teams (up to 30 users). Bring your own API keys, avoid seat markups, or deploy on your own infrastructure.
- **Team-ready on your own server**: Self-host and require sign-in with your organization's identity provider (OIDC, for example Microsoft Entra ID), and set the AI provider once for everyone. Both SSO and managed configuration are part of the free self-hosted product. See [SSO](https://opendocbot.com/docs/enterprise/sso) and [Managed configuration](https://opendocbot.com/docs/enterprise/managed-configuration).

## Compatibility

### Supported Office Apps

| Platform | Support |
|---|---|
| **Microsoft 365** (desktop) | ✅ Fully supported |
| **Microsoft 365** (web) | ✅ Fully supported |
| Office 2016/2019/2021 (perpetual) | ❌ Not supported |
| LibreOffice / Google Docs | ❌ Not supported |

### Supported AI Providers & Features

| Provider | Reasoning | Reasoning Effort | Token Streaming | Prompt Caching | Model Listing |
|---|:---:|:---:|:---:|:---:|:---:|
| **OpenAI** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Anthropic** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Gemini** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DeepSeek** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Microsoft Foundry** | ✅\* | ⚠️\*\* | ✅ | ✅ | ⚠️ |
| **Ollama (Local)** | ✅\* | ❌\*\* | ✅ | ❌ | ❌ |
| **OpenRouter** | ✅\* | ⚠️\*\* | ✅ | ✅ | ✅ |
| **OpenCode** | ✅ | ⚠️\*\* | ✅ | ✅ | ⚠️\*\*\* |

\* *Reasoning availability depends on the underlying model.*  
\*\* *Reasoning effort depends on endpoint support.*  
\*\*\* *No one-click preset: configure OpenCode via the **Custom** preset. See [here](https://opendocbot.com/docs/providers/opencode).*  
*Microsoft Foundry uses the OpenAI-compatible v1 API; the model field is your **deployment name**. See [here](https://opendocbot.com/docs/providers/foundry).*

## Quickstart

Install OpenDocBot from the [Microsoft Marketplace](https://marketplace.microsoft.com/en-us/product/WA200012650?tab=Overview): open Word, Excel or PowerPoint, go to **Home > Add-ins**, search for **OpenDocBot** and install it. Then connect your own AI provider.

The add-in is served from [opendocbot.com/app](https://opendocbot.com/app) once, when the taskpane first loads; after that it runs entirely locally and talks to your provider directly. No document data reaches our servers.

📖 Full Quick Start guide:
[opendocbot.com/docs/quickstart](https://opendocbot.com/docs/quickstart)

## Docs
See the full technical documentation at [opendocbot.com/docs](https://opendocbot.com/docs).

## Self-Hosting

Serve OpenDocBot directly from your own infrastructure. Self-hosting also unlocks the team features:

- **SSO**: require sign-in with your organization's identity provider (OIDC, for example Microsoft Entra ID) before the add-in loads.
- **Managed configuration**: set the provider, API key, and model once for everyone on the instance, while the rest stays editable.

Both ship with the free self-hosted product. See the [Self-hosting guide](https://opendocbot.com/docs/selfhosting) for setup.

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 18, TypeScript, Tailwind CSS, ShadCN UI |
| **Build & State** | Vite, Zustand (Persisted) |
| **Office APIs** | Word.js, Excel.js, PowerPoint.js |
| **Testing** | Vitest, React Testing Library |

## License

OpenDocBot is licensed under a **fair-code** license: the source and development are public and
auditable on GitHub, and it is free for individuals and teams up to **30 users**.
Enterprises beyond that threshold require a commercial license. In plain words:
[what you can and cannot do](https://opendocbot.com/docs/license).

See [LICENSE](LICENSE). Contributions are subject to the
[Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT).
