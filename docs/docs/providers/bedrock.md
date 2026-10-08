---
title: Amazon Bedrock
description: Connect OpenDocBot to Amazon Bedrock with a Bedrock API key. Enable model access, create a key, pick the preset, choose a model.
---

# Amazon Bedrock

OpenDocBot talks to Amazon Bedrock through the **Converse API** on
`bedrock-runtime`, authenticated with a **Bedrock API key** (a bearer token). No
AWS SDK, SigV4 signing, or long-lived IAM secret is involved.

**Setup:**

1. In the AWS Console, open Amazon Bedrock and enable the models you need in your
   target **Region** (model access is per-region).
2. Create a key under Bedrock -> **API keys**.
3. Preset: **Amazon Bedrock**
4. Enter the **Region** id the key was created for (for example `eu-north-1`),
   then paste the **API key**.
5. Pick a **model** (or **Custom model ID**), **Test Connection**, **Apply**.

<LiteYouTube id="7X5c-64qp7A" title="OpenDocBot Connecting Amazon Bedrock" />

The runtime endpoint is derived from the region:
`https://bedrock-runtime.<region>.amazonaws.com`.

**API keys.** **Short-term** keys start with `bedrock-api-key-`, last up to 12
hours, and only work in the Region that created them (safest). **Long-term** keys
start with `ABSK`, work in any Region, and are meant for exploration — prefer
short-lived keys or a managed deployment, and rotate regularly. The default
`AmazonBedrockLimitedAccess` policy is enough; narrower keys need
`bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`.

**Models.** The list is fetched from Bedrock (`ListFoundationModels` /
`ListInferenceProfiles`) and shows only **ACTIVE**, text-output,
Converse-capable models. Profile-only models appear by their profile ID (for
example `eu.anthropic.claude-sonnet-4-6`). If discovery fails the add-in falls
back to `/v1/models` and a small static list; use **Custom model ID** for
anything missing (for example a wrong or Region-specific model returns 404).

::: warning Account not authorized
A **403**, **"Your account is currently being verified."**, or **400
`NOT_AUTHORIZED`** means the AWS *account* is not yet authorized for Bedrock —
not a key or model-access problem. New accounts usually clear this in a few
hours. A persistent `NOT_AUTHORIZED` (check with `aws bedrock
get-foundation-model-availability --region <region> --model-id <model-id>`)
has **no self-service fix**: open an AWS Support case under **Account and
billing** asking to complete Bedrock account verification.
:::

::: tip Browser blocked (CORS)
If the taskpane cannot call Bedrock directly, enable **Proxy API requests
through this server** (self-hosted / dev deployments) to route the request
through the same-origin `/proxy/` endpoint.
:::

Prompt caching, key storage, and reasoning are covered in
[Providers](/docs/providers/) and
[Configuration](/docs/configuration#prompt-caching).
