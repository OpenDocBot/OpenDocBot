---
title: Troubleshooting
description: Common OpenDocBot problems and fixes. HTTPS, provider connection issues, CORS, the proxy, and sideloading.
---

# Troubleshooting

## The add-in won't load / "This add-in is not supported"

- Confirm you're using **Microsoft 365** (current channel). The manifest
  requires `SharedRuntime 1.1`; host-specific API sets (`WordApi 1.3`,
  `ExcelApi 1.1`, `PowerPointApi 1.4`) are checked at runtime.
  Perpetual Office 2016/2019/2021 won't satisfy these.
- Make sure the dev server is running on **HTTPS** (`https://localhost:3000`) and
  the certificate files exist. Office blocks HTTP and untrusted certs.
- Re-upload the manifest if you edited [`manifest.xml`](https://github.com/OpenDocBot/OpenDocBot/blob/main/manifest.xml).

## Connection test fails

- **Key rejected (401/403)**: wrong or expired API key. Regenerate it.
- **404**: wrong endpoint path. Endpoints are base URLs (no trailing slash),
  e.g. `https://opencode.ai/zen/go/v1`, not `/v1/chat/completions`.
- **CORS error**: the provider doesn't allow browser-origin requests. On a
  **self-hosted** deployment, enable **Advanced → Proxy API requests through
  this server** to forward requests server-to-server. On a **hosted** instance,
  use a CORS-friendly provider (OpenAI, Gemini, Anthropic, OpenRouter), see
  [Compatibility](/docs/compatibility#cors-and-the-proxy).
- **Anthropic CORS**: the add-in sends the
  `anthropic-dangerous-direct-browser-access` header automatically; if you're
  calling Anthropic through a proxy that strips headers, add it there.
- **Ollama unreachable**: confirm `ollama serve` is running and the model is
  pulled. The endpoint must match where `ollama serve` is listening
  (`localhost` for a local install, or the server address for a shared Ollama).

## When to use the old /chat/completions endpoint

Some OpenAI-compatible endpoints (and older Ollama versions) don't implement the
Responses API (`/responses`). If tool calls or streaming misbehave, open
**Settings → Advanced** and enable **Use old /chat/completions endpoint**.

## Reasoning block never appears

Reasoning depends on the **model**, not the add-in:

- The model must actually emit reasoning tokens (e.g. a DeepSeek-style model via
  OpenCode Zen, Claude thinking, Gemini thought parts).
- Non-reasoning models produce no block, and that's expected.

If reasoning used to work and stopped, check you're on the latest build; the
OpenCode Zen stream uses `response.reasoning_text.delta`, which is handled
explicitly.

## The model returns an empty response

The add-in shows a visible note when a reply comes back empty with no tool call.
Causes and fixes:

- **Output token limit**: the reply was cut off. Raise **Max Tokens** in
  Settings (Advanced).
- **Provider stall / malformed request**: retry, or run **Test Connection**.

A truncated reply (content but cut off) shows a specific truncation notice
instead.

## "PowerPoint assigned new ids" warning

OOXML write-backs re-import the slide, which makes PowerPoint renumber the slide
and all its shapes. After any `edit_slide_text` / `edit_slide_xml`, re-run
`list_slide_shapes` to get fresh shape ids before more edits. This is expected
behavior, not a bug.

## Shapes silently dropped after an OOXML edit

PowerPoint can drop malformed XML during re-import. The tool verifies the
re-imported shape count and warns when shapes were lost. Prefer
`insert_slide_element` for adding shapes; use `edit_slide_xml` only for
text/table-level edits you can't do otherwise, and verify with `read_slide`
afterwards.

## A background shape covers my slide text

Symptom: after changing the theme, text is hidden and you only see the
background color. Cause: a full-bleed rectangle is stacked **on top of** the
text in the slide's shape order, hiding it. Two ways this is handled:

- **New backgrounds**: `insert_slide_element` automatically places full-bleed
  shapes (covering nearly the whole slide) at the back of the stacking order,
  behind existing content. Insert the rectangle with full slide size, then fill
  it with `format_shape`.
- **Existing slides**: run `verify_slides`; it reports `z_order_warnings` when
  a background is stacked in front of content. Re-insert the background as a
  full-bleed shape so it sits behind the text.

Note: PowerPoint.js has no z-order API, so scripts that try `shape.zOrder(...)`
fail with "is not a function". Use `insert_slide_element` (full-bleed shapes
auto-back) or `list_slide_shapes` (`order` field, 0 = back) to inspect stacking.

## "Cannot read properties of null (reading 'async')" in edit_slide_xml

The tool exposes a `slidePath` global; the zip always contains exactly one
slide at that path. Never guess position-based names like `slide2.xml`; they
don't exist. If you still see the error, use `zip.file(slidePath)`.

## Office.js property-not-loaded errors in execute_office_js

Office.js proxies only expose **loaded** properties. Before reading, load and
sync:

```js
const shapes = slide.shapes;
shapes.load("top,left,width,height,name");
await context.sync();
const items = shapes.items;
```

The add-in appends this hint to the error automatically when it detects a
property-not-loaded failure.

## The conversation looks wrong or I want a clean slate

- **Clear conversation**: trash icon in the header.
- **Reset settings**: clear browser storage for the add-in's origin, or
  overwrite fields and press **Apply**.

## Still stuck?

Use **debug export** (copy button in the chat); it captures the full
conversation, tool traces, and debug log. Paste it into a
[GitHub issue](https://github.com/OpenDocBot/OpenDocBot/issues) with a
description of what you did.
