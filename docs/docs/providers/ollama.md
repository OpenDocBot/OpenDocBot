---
title: Ollama
description: Run local models with OpenDocBot via Ollama. No API key required and no data leaving your premises.
---

# Ollama

Run a model locally with no API key and no data leaving your premises.

**Prerequisites:**

- [Ollama](https://ollama.com) installed and running (`ollama serve`)
- At least one model pulled, e.g. `ollama pull llama3.1`

**Setup:**

1. Preset: **Ollama**
2. Adjust the endpoint in case it's needed. The default endpoint is `http://localhost:11434/v1`
3. No key required; the field is hidden
4. Type your model name (the model list isn't auto-fetched for Ollama); e.g. `llama3.1`
5. **Test Connection**, **Apply**

<!-- Connection video: paste the <iframe> embed here. -->

::: tip
If Ollama rejects the request, enable **Use old /chat/completions endpoint** in
Settings → Advanced; some Ollama versions don't implement the Responses API
(`/responses`).
:::

::: warning Browser CORS
OpenDocBot runs in the browser, so requests to Ollama must come from an origin
the Ollama server allows. Ollama only accepts the origins listed in the
`OLLAMA_ORIGINS` environment variable (default: `localhost,127.0.0.1,0.0.0.0`).

The Office taskpane loads the add-in as a page from a specific URL, and all
requests to Ollama are made from that page. So Ollama sees that page's origin,
**not** `localhost`. What to set depends on how the add-in is served:

- **Hosted instance**: the app is served from `https://opendocbot.com/app`, so
  the origin Ollama sees is `https://opendocbot.com`. Restart Ollama with:

```bash
export OLLAMA_ORIGINS="https://opendocbot.com"
ollama serve
```

- **Self-hosted**: use the hostname/IP/domain of your OpenDocBot instance (the
  origin shown in the taskpane's address bar). For example, serving the add-in
  from `https://localhost:3000`:

```bash
export OLLAMA_ORIGINS="https://localhost:3000"
ollama serve
```

You can list multiple origins, comma-separated:
`OLLAMA_ORIGINS="https://opendocbot.com,https://localhost:3000"`.
:::

::: tip Shared, central, or key-protected Ollama server
The default endpoint is `localhost` for a single machine. Ollama can also run
on a shared or central server (it binds `0.0.0.0` and exposes an
OpenAI-compatible `/v1` API). If that's your case, select the **Ollama** preset and change the
**Endpoint URL** to the server's address, e.g. `http://ollama-server:11434/v1`.

If your Ollama server requires an API key (e.g. `OLLAMA_API_KEY` is set),
select the **Custom** preset instead, set the **Endpoint URL** to the Ollama
server's address, and paste the key in the **API Key** field. OpenDocBot sends
it as an `Authorization: Bearer` header, which Ollama validates.
:::