> [!NOTE]
> **OpenDocBot is in Early Access** - Give the repo a **Star** ⭐ and **Watch** 👀 to follow updates.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c">
    <img src="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c" alt="OpenDocBot" width="320" />
  </picture>
</p>

<p align="center"><strong>The Office AI agent you can actually trust<br/>Client-side, provider-agnostic, and fully auditable. No lock-in. No hidden telemetry.</strong></p>

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
| **Ollama (Local)** | ✅\* | ❌\*\* | ✅ | ❌ | ❌ |
| **OpenRouter** | ✅\* | ⚠️\*\* | ✅ | ✅ | ✅ |
| **OpenCode** | ✅ | ⚠️\*\* | ✅ | ✅ | ⚠️\*\*\* |

\* *Reasoning availability depends on the underlying model.*  
\*\* *Reasoning effort depends on endpoint support.*  
\*\*\* *No one-click preset: configure OpenCode via the **Custom** preset. See [here](https://opendocbot.com/docs/providers/opencode).*

## Quickstart

> [!IMPORTANT]
> **OpenDocBot is currently in Early Access.** It is already usable, but Microsoft Store distribution is not available yet, so Office sideloading is currently required.
>
> We're looking for **Microsoft 365 power users** who want to try OpenDocBot early and help shape the product. Expect some rough edges. Feedback, bug reports, and feature requests are especially welcome.

The fastest way to get started is using the **hosted instance** at
[opendocbot.com/app](https://opendocbot.com/app). We only serve the application once. The application
runs entirely locally after the initial taskpane load. No document data reaches our servers.

Until Microsoft Store distribution is available, sideloading is required. Scripts for automated sideloading configuration are available, see the [Sideloading Guide](https://opendocbot.com/docs/quickstart#_1-sideload-the-add-in-in-office) for specific instructions for your OS and Office version.

📖 Full Quick Start guide:
[opendocbot.com/docs/quickstart](https://opendocbot.com/docs/quickstart)

## Docs
See the full technical documentation at [opendocbot.com/docs](https://opendocbot.com/docs).

## Self-Hosting

Serve OpenDocbot directly from your own infrastructure.

📖 [opendocbot.com/docs/selfhosting](https://opendocbot.com/docs/selfhosting)

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
