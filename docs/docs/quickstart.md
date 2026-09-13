---
title: Quickstart
description: Try the hosted OpenDocBot instance, sideload it in Word, Excel or PowerPoint, and connect your own AI provider.
---

# Quickstart

## What is OpenDocBot?

OpenDocBot is a 100% client-side, provider-agnostic AI agent for Microsoft Office (Word, Excel, PowerPoint). Connect your own API keys from any provider (OpenAI, DeepSeek,
Anthropic, Gemini, Ollama, OpenRouter, OpenCode, or any OpenAI-compatible
endpoint), and the model reads, writes and formats your content directly.

Bring your own keys and models, gate every action behind **human-in-the-loop
approval**, or **self-host** it: your data never has to leave your
infrastructure.

## Try the hosted instance

A public instance is hosted at
[opendocbot.com/app](https://opendocbot.com/app). We only serve the add-in
**once**, when your Office taskpane first loads; afterwards everything runs
**entirely on your machine** and talks to your AI provider directly. **No
document data ever reaches our servers.**

### Requirements

- **Microsoft Office 365**: Word, Excel or PowerPoint (desktop or web)
- An LLM provider that allows browser access (see below)

### 1. Sideload the add-in in Office

> ⚠️ We are working on publishing OpenDocBot to the **Microsoft Store**. Until
> then, sideload the add-in as described below; same add-in, same experience.

<Tabs>
  <Tab label="Office Local">

#### Office 365 Local

In case of having the Office 365 apps installed locally, the add-in can be sideloaded persistently. 

<Tabs>
  <Tab label="Windows">

Run the following command in **PowerShell as administrator**:

```powershell
irm https://opendocbot.com/sideload.ps1 | iex
```

This command runs the https://opendocbot.com/sideload.ps1 script on your machine, which automatically configures persistent add-in sideloading
via [the network share method](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins). 

::: warning Admin Priviledges
This scripts requires admin priviledges due to the required creation of a local network share (New-SmbShare cmdlet). The script can be fully
audited at [https://opendocbot.com/sideload.ps1](https://opendocbot.com/sideload.ps1)
:::

<iframe width="600" height="337"
  src="https://www.youtube-nocookie.com/embed/jrE7wh2EFDg"
  title="OpenDocBot Sideloading Office Local"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen loading="lazy"></iframe>

  </Tab>
  <Tab label="macOS">

Run the following command in **Terminal**:

```bash
curl -fsSL https://opendocbot.com/sideload.sh | bash
```

This command runs the https://opendocbot.com/sideload.sh script on your machine, which automates the 
[sideloading process for macOS](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac): 
it downloads the manifest into the add-in folder (`wef`) of Word, Excel and PowerPoint.

Restart Word, Excel and PowerPoint, then check **Home > Add-ins**. 

Note that clearing the Office cache removes the add-in.

  </Tab>
</Tabs>

  </Tab>
  <Tab label="Office Web">

#### Office 365 Web Version (any OS)

Download the manifest file from the link below and upload it in the app (Home > Add-ins > More
Add-ins > My Add-ins > Manage My Add-ins > Upload My Add-in). Unfortunately this method does not load the addin
persistently, the add-in may vanish on page refresh. 

[Download manifest.xml](https://opendocbot.com/manifest.xml)

<iframe width="600" height="337"
  src="https://www.youtube-nocookie.com/embed/xbNe3VhVdd4"
  title="OpenDocBot Sideloading Office Web"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen loading="lazy"></iframe>

  </Tab>
  <Tab label="Teams and IT-managed">

#### Teams and IT-managed devices

Deploy the [manifest.xml](https://opendocbot.com/manifest.xml) file centrally via the Microsoft 365 admin center:
[Manage deployment of add-ins](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-deployment-of-add-ins?view=o365-worldwide).

Note that, despite using the hosted instance, none of your document data reaches our servers. 
Despite that, the the application serving can also be [self-hosted](/docs/selfhosting) for fully airgapped deployments. 

OpenDocBot is Source-Available and 100% free for personal use and small teams (up to 30 users)
  </Tab>
</Tabs>

### 2. Connect a provider

1. Open the add-in **Settings** (gear icon)
2. Pick a **Preset**, paste your **API key**
3. **Test Connection**, then **Apply**

<iframe width="720" height="405"
  src="https://www.youtube-nocookie.com/embed/hkTQNekzxUE"
  title="How to connect OpenDocBot to an AI Provider"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  allowfullscreen loading="lazy"></iframe>

### 3. Talk to your document

Type a request and press **Enter**; for example, in Word: *"Make the selected
heading green and bold."* Or in PowerPoint: *"Turn this deck into a retro wine
label style."*

---

## Self-hosting

If you want full control, or need the **proxy** for providers without browser
CORS (like OpenCode), you can run OpenDocBot on your own infrastructure. The
full guide (Docker, Node, static hosting, HTTPS/TLS certificates, the proxy and
production manifests) is on the [Self-hosting](/docs/selfhosting) page.

---

## Next steps

- [Compatibility](/docs/compatibility): providers, features, Office versions, CORS
- [Configuration](/docs/configuration): every setting explained
- [Features](/docs/features): HITL, prompt caching, reasoning and more
- [Self-hosting](/docs/selfhosting): Docker, the proxy, production manifests
