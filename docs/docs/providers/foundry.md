---
title: Microsoft Foundry
description: Connect OpenDocBot to Microsoft Foundry (Azure AI). Deploy a model, copy the endpoint and key, pick the preset, enter the deployment name.
---

# Microsoft Foundry

OpenDocBot connects to **Microsoft Foundry** through its **v1 API**, the
OpenAI-compatible surface Microsoft recommends.

**Setup:**

1. Preset: **Microsoft Foundry**
2. In the [Foundry portal](https://ai.azure.com), deploy a model and note its **deployment name**
3. Copy the resource **Endpoint** and one of its **Keys**
4. Paste the endpoint and key, then type the **deployment name** into **Model**
5. **Test Connection**, **Apply**

<LiteYouTube id="sWb9lHCYnkY" title="OpenDocBot Connecting Microsoft Foundry" />

**Notes:**

- **Endpoint.** Paste the endpoint from the Foundry portal. Any resource URL
  works: the add-in normalizes it to the canonical v1 base
  `https://<resource>.services.ai.azure.com/openai/v1`. That includes the
  resource root, `/models`, `/models/chat/completions`, or a full
  `/openai/v1/chat/completions?api-version=...` URL. The v1 API is also served
  on `https://<resource>.openai.azure.com/openai/v1` (classic Azure OpenAI
  resources); use whatever your portal shows.
- **Model = deployment name.** The **Model** field is your **deployment name**
  (or the model id for serverless endpoints), not the base model's public name.
  OpenDocBot does not query the Foundry catalogue; enter the name exactly as it
  appears in the portal, for example `gpt-oss-120b` or `DeepSeek-V4-Flash`.
- **No `api-version`.** The v1 API does not use dated API versions.
- **Legacy Model Inference API is not supported.** Endpoints of the form
  `/models/chat/completions?api-version=...` are not used by this preset; the
  v1 base above is.
- Reasoning and prompt caching work where the underlying model supports them.
- **Browser blocked (CORS).** If the taskpane cannot call the endpoint directly,
  enable **Proxy API requests through this server** (self-hosted / dev
  deployments) to route the request through the same-origin `/proxy/` endpoint.

The API key is stored in browser `localStorage` like every other provider key and
is sent only to your Foundry endpoint. Treat it as a secret and rotate keys you
no longer use.
