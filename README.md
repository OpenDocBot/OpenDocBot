> [!NOTE]
> **OpenDocBot is under active development** — Give the repo a **Star** ⭐ and **Watch** 👀 to follow updates and support open-source Office AI!

<p align="center">
  <img src="src/assets/logo.svg" alt="OpenDocBot" width="320" />
</p>

<p align="center"><strong>The open-source, local-first alternative to Microsoft Copilot for Office<br/>Bring your own AI provider (OpenAI, Anthropic, Gemini, Deepseek, Ollama, OpenRouter, OpenCode Zen) to Word, Excel & PowerPoint</strong></p>

<div align="center">
  <a href="https://github.com/opendocbot/opendocbot/stargazers" target="_blank">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/opendocbot/opendocbot?style=flat&logo=github"></a>
  <a href="https://github.com/opendocbot/opendocbot/releases" target="_blank">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/opendocbot/opendocbot?style=flat"></a>
  <a href="https://github.com/opendocbot/opendocbot/blob/main/LICENSE" target="_blank">
    <img alt="License" src="https://img.shields.io/github/license/opendocbot/opendocbot?style=flat"></a>
</div>

<br />

Works on **Microsoft 365** (Word, Excel, PowerPoint) on Desktop & Web.

---
## Features

- **Universal Office Suite Integration**: One add-in for Word, Excel, and PowerPoint. Read, write, analyze content, generate formulas, auto-format tables, and build slide decks directly inside your workflow.
- **Provider Freedom & Zero Lock-In**: Connect to OpenAI, Anthropic, Gemini, Deepseek, Ollama, OpenRouter, OpenCode Zen, or any OpenAI-compatible API. Switch instantly between models and providers.
- **100% Client-Side & Local-First**: Zero telemetry. Your document data goes straight from your browser to your provider, or stays completely offline when paired with **Ollama**.
- **Human-in-the-Loop Safety**: Review and approve model actions before any text, formula, or slide layout is modified in your document.
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
| **Ollama (Local)** | ✅\* | ❌\*\* | ✅ | ❌ | ❌ |
| **OpenRouter** | ✅\* | ⚠️\*\* | ✅ | ✅ | ✅ |
| **OpenCode Zen** | ✅ | ⚠️\*\* | ✅ | ✅ | ✅ |

\* *Reasoning availability depends on the underlying model.*  
\*\* *Reasoning effort depends on endpoint support.*

## Quickstart

The fastest way to get started is using the **hosted instance** at
[opendocbot.com/app](https://opendocbot.com/app). We only serve the application once. The application
runs entirely inside your browser after the initial taskpane load. No document data reaches our servers.

📖 Quick Start guide:
[opendocbot.com/docs/quickstart](https://opendocbot.com/docs/quickstart)

## Self-Hosting

Serve OpenDocbot directly from your own infrastructure for a fully airgapped setup.

📖 [opendocbot.com/docs/selfhosting](https://opendocbot.com/docs/selfhosting)

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 18, TypeScript, Tailwind CSS, ShadCN UI |
| **Build & State** | Vite, Zustand (Persisted) |
| **Office APIs** | Word.js, Excel.js, PowerPoint.js |
| **Testing** | Vitest, React Testing Library |

## License

See [LICENSE](LICENSE). Contributions are subject to the
[Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT).
