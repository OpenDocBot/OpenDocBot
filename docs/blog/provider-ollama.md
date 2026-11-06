---
title: " OpenDocBot with Ollama: A fully private Office agent"
description: "Connect OpenDocBot to a local Ollama model and get a private agent in Word, Excel and PowerPoint, without your documents leaving your PC."
date: "2026-11-06"
sidebar: false
outline: false
prev: false
next: false
---

# OpenDocBot with Ollama: A fully private Office agent

By OpenDocBot · November 6, 2026

[Back to all posts](/blog/)

Some documents carry content that a provider must not receive: contracts under an NDA, personal data covered by data protection laws, health records, internal financials. A cloud model sends that content to another organisation, the model provider, under its own terms. For a company this can mean sending personal client data to a third party, and require prior customer approval.

Ollama removes that third party. The model runs on hardware you control and answers inside your network, so nothing depends on another company's terms, availability or prices. If the setup changes later, another model or another server is a configuration change: the documents and the workflow stay where they are.

This article covers how to pair OpenDocBot with Ollama to build a completely self-hosted, private AI assistant for your document workflows.

## Before you begin

- Install Ollama and start it with `ollama serve`.
- Pull at least one model, for example `ollama pull llama3.1`.
- Install the OpenDocBot add-in in Word, Excel or PowerPoint. The [quickstart](https://opendocbot.com/docs/quickstart) covers installation.
- Note the exact model name, including its tag. The add-in does not query Ollama for the list of available models, so you type the name yourself.

No API key is required. When the Ollama preset is selected, the key field is hidden.

## Configure the connection

1. Open the add-in task pane and select the **Ollama** preset.
2. Check the **Endpoint URL**. The default value is `http://localhost:11434/v1`. Change it only if Ollama listens on a different host or port.
3. Leave the key field empty.
4. Enter the model name, for example `llama3.1`. It must match a model that exists on the server.
5. Click **Test Connection**, then click **Apply**.

<div class="blog-demo">
  <HeroDemo initial="provider" :show-tabs="false" />
</div>

If the test succeeds, the configuration is complete. If it fails with a network error, the cause is usually the add-in origin. The next section covers it.

## Allow the add-in origin

Ollama accepts requests only from the origins listed in the `OLLAMA_ORIGINS` environment variable. The default value is `localhost,127.0.0.1,0.0.0.0`.

OpenDocBot runs in the browser, so requests to Ollama are sent from the origin that serves the task pane, not from `localhost`. An origin that is not listed is rejected.

For the hosted add-in, served from `https://opendocbot.com/app`, the origin is `https://opendocbot.com`. Set the variable before the server starts:

```bash
export OLLAMA_ORIGINS="https://opendocbot.com"
ollama serve
```

For a self-hosted deployment, use the origin shown in the task pane address bar:

```bash
export OLLAMA_ORIGINS="https://opendocbot.example.com"
ollama serve
```

Separate several origins with commas:

```bash
export OLLAMA_ORIGINS="https://opendocbot.com,https://opendocbot.example.com"
ollama serve
```

If Ollama is already running, restart it after changing the variable. Then reopen the task pane and click **Test Connection** again.

## Use a shared Ollama server

When Ollama runs on a server that several people use, keep the **Ollama** preset and change **Endpoint URL** to that server, for example `http://ollama-server:11434/v1`. Configure `OLLAMA_ORIGINS` on the server as well, using the origin of the add-in.

If the server requires a key, set through `OLLAMA_API_KEY`, the Ollama preset does not fit because it has no key field. Select the **Custom** preset, enter the same endpoint and paste the key in **API Key**. The key is sent in the `Authorization` header as a bearer token.

## Verify the connection

1. With Ollama running, click **Test Connection**. The add-in reports a successful connection.
2. Run a short prompt on an open document. The response is inserted in the document.
3. Stop Ollama and click **Test Connection** again. The test fails. This confirms that the add-in uses the endpoint you configured and not another provider.

## Troubleshoot

**The request is rejected.** Some versions of Ollama do not implement the Responses API. Open **Settings → Advanced**, enable **Use old /chat/completions endpoint** and test the connection again.

**The origin is configured, but requests still fail.** Confirm that the variable was set before the server started. A variable exported in another shell, or after `ollama serve` is already running, has no effect until the server restarts.

**The connection fails with a model error.** The model name in the add-in must match a model that exists on the server. OpenDocBot does not validate the name before it sends the request.

## What's next

- [Configuration](https://opendocbot.com/docs/configuration) for endpoint defaults and per-user settings.
- [Troubleshooting](https://opendocbot.com/docs/troubleshooting) for connection errors that are not specific to Ollama.
- [Self-hosting](https://opendocbot.com/docs/selfhosting) to serve the add-in from your own infrastructure.

OpenDocBot runs on the models and keys you already have, with no per-seat fee. [Install from the Microsoft Marketplace](https://marketplace.microsoft.com/en-us/product/WA200012650?tab=Overview).
