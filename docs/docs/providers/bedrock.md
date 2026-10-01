---
title: Amazon Bedrock
description: Use Amazon Bedrock models in OpenDocBot with a Bedrock API key and the Converse API.
---

# Amazon Bedrock

OpenDocBot talks to Amazon Bedrock through the **Converse API** on the
`bedrock-runtime` endpoint, authenticated with a **Bedrock API key** (a bearer
token). No AWS SDK, no SigV4 signing, and no long-lived IAM secret are involved.

- **Preset:** Amazon Bedrock
- **Underlying protocol:** Converse / ConverseStream
- **Default model:** `nvidia.nemotron-super-3-120b`
- **Auth:** `Authorization: Bearer <Bedrock API key>`

## Setup

### 1. Enable model access

In the AWS Console, open Amazon Bedrock, switch to the **Region** you want to
use, and request/enable access to the models you plan to use. Bedrock model
access is per-region.

### 2. Create a Bedrock API key

Amazon Bedrock console -> **API keys** -> generate a key. There are two kinds,
recognisable by their prefix:

- **Long-term** keys start with `ABSK` (for example `ABSKQmVkcm9ja0FQSUtleS0...`)
  and last until a configured date. They work in **any** Region, but AWS
  recommends them for exploration only, so prefer a short-lived key or a managed
  deployment for production use, and rotate regularly.
- **Short-term** keys start with `bedrock-api-key-` and last up to 12 hours.
  They are tied to the console session that created them and can only be used in
  the Region they were generated in. They are the safest option but expire
  quickly.

The default `AmazonBedrockLimitedAccess` policy is enough for inference. If your
key is more restricted, it needs `bedrock:InvokeModel` and
`bedrock:InvokeModelWithResponseStream`.

### 3. Configure the add-in

1. Open **Settings -> Connection**.
2. Choose the **Amazon Bedrock** preset.
3. Enter the **Region** id the key was created for (for example `eu-north-1`).
4. Paste the **API key**.
5. Pick a **model** from the list (or choose **Custom model ID** and type one).

The runtime endpoint is derived from the region:
`https://bedrock-runtime.<region>.amazonaws.com`.

## Models

The model list is fetched from Bedrock itself:

- `ListFoundationModels` and `ListInferenceProfiles` return the models available
  in the selected region.
- Only **ACTIVE**, **text-output**, **Converse-capable** models are listed.
- Models that are only reachable through an inference profile are listed by
  their profile ID (for example `eu.anthropic.claude-sonnet-4-6`).

If discovery fails, the add-in falls back to the Mantle `/v1/models` endpoint and
then to a small static list. Use **Custom model ID** to enter any model or
inference-profile ID that is not listed.

Because the list comes from the API, models that are retired disappear on their
own. If the configured model is removed by AWS, requests return a clear error and
you can simply pick another model.

## Troubleshooting

- **400 "Operation not allowed" / `NOT_AUTHORIZED`.** This is an
  **account-level** block, not an IAM, key, or model-access problem. Check it
  with:
  `aws bedrock get-foundation-model-availability --region <region> --model-id <model-id>`
  If `authorizationStatus` is `NOT_AUTHORIZED` (while `entitlementAvailability`,
  `regionAvailability` and `agreementAvailability` are `AVAILABLE`), AWS has not
  yet authorized Bedrock for your account. It is **separate** from EC2/billing
  verification, so starting an EC2 instance does not always clear it, and there
  is **no self-service fix**. Open a free AWS Support case under **Account and
  billing** asking to complete Bedrock account verification, and mention the
  `NOT_AUTHORIZED` status. Alternatively, use an AWS account that already has
  Bedrock authorization.
- **"Your account is currently being verified."** New AWS accounts must be
  verified before inference is allowed. This normally clears within a couple of
  hours, but for Bedrock it can require the support case above.
- **403 Access denied.** The model is not enabled in the selected Region, the
  account lacks Bedrock authorization (see above), or the key lacks the invoke
  permissions listed earlier.
- **404 Model not found.** The model ID is wrong or is not available in that
  Region. Try an inference-profile ID instead of the base model ID.
- **Browser blocked (CORS).** If the taskpane cannot call Bedrock directly, use
  the **Proxy API requests through this server** option (self-hosted / dev
  deployments) to route the request through the same-origin `/proxy/` endpoint.

## Security

The API key is stored in browser `localStorage` like every other provider key,
and is sent only to the Bedrock endpoint. Treat it as a secret: prefer
short-lived keys, restrict the key's IAM permissions, and rotate or deactivate
keys you no longer use.

## Prompt caching

Some Bedrock models support **explicit prompt caching** through cache
checkpoints (`cachePoint`) in the Converse request. When the selected model
advertises caching, OpenDocBot adds checkpoints after the tool definitions, the
system prompt, and the last turn, so the stable prefix of the conversation is
reused across requests. The cached-token counts from the response are recorded
alongside normal usage.

Caching is only enabled for models that explicitly support it (the default
Nemotron model does not), so the add-in never sends a `cachePoint` to a model
that would reject it. Implicit caching, where the model caches eligible prefixes
automatically, needs no configuration.

Reasoning (extended thinking) is not exposed yet and is a planned follow-up.
