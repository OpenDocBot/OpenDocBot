---
title: Features
description: Human-in-the-loop approval, prompt caching, reasoning effort, follow-up questions, and more OpenDocBot capabilities.
---

# Features

## Agent loop

Every message runs through an **agent loop**:

1. **Build the request**: OpenDocBot assembles the conversation for the model:
   the system prompt (tool definitions and rules), the prior history, and your
   message with the document's current state (`<doc_state>`) prepended as
   private context.
2. **Stream the reply**: the model streams back text and/or **tool calls**.
3. **Execute tools**: any tool calls are run against the document via the
   Office.js APIs; each result is appended to the conversation and fed back to
   the model.
4. **Repeat**: the loop returns to step 2 with the updated history, until the
   model sends no more tool calls and gives its final answer.

- The model sees the document outline (`<doc_state>`) at the start of every turn.
- It calls tools (read, write, format, verify) through the Office.js APIs.
- The loop repeats until the model is done, **max 100 iterations** per message
  (configurable in Settings → Behavior → **Max Iterations**).
- If the exact same tool call fails **3 times consecutively**, the loop aborts
  with an error instead of burning iterations.

### Custom instructions

The **Behavior** tab has a **Custom Instructions** box whose contents are
injected into the system prompt on every turn. They apply to the whole
conversation and take precedence over conflicting built-in rules. Useful for
persistent preferences like tone, language, or formatting conventions. See
[Configuration](/docs/configuration#custom-instructions).

## Task list

For complex, multi-step jobs, the model keeps a lightweight **task list**, a
to-do list shown in a collapsible **Tasks** panel above the chat:

- **Model-managed**: the model creates tasks and tracks them with the
  `update_todos` tool, marking one `in_progress` at a time and checking them
  off as it works.
- **Statuses**: `[ ]` pending, `▸` in progress, `[x]` completed, `[–]` cancelled.
- **Progress counter**: the panel header shows `done/total` (e.g. `2/5`).
- **All hosts**: available in Word, Excel, and PowerPoint.
- **Lifecycle**: the list persists across turns within a conversation and is
  cleared when you clear the chat. The panel only appears while there is at
  least one open task (`pending` or `in_progress`); once every task is
  completed or cancelled it disappears, and it reappears the next time the
  model creates new tasks.

## Tool calling per host

The tool registry is filtered per host, so the model only sees relevant tools:

| Host | Tools |
|---|---|
| **Word** | read/search/edit text, lists, collapse blank paragraphs, verify structure, `execute_office_js`, `ask_user_question` |
| **Excel** | list sheets, read/write/format ranges, insert/delete rows & columns, merge, clear, sort, set sizes, `execute_office_js`, `ask_user_question` |
| **PowerPoint** | deck structure, slide read/list, styled text read & edit, shape insert/remove/format, structure ops (create/delete/duplicate/move), masters, verify slides, `edit_slide_xml`, `execute_office_js`, `ask_user_question` |

Write tools are tracked separately (see Human in the Loop below).

## Human in the Loop

When enabled (Settings → **Behavior** tab), every **document-modifying** tool
call pauses for your approval:

1. The model proposes an action (e.g. "Change the heading to orange")
2. An **ApprovalCard** appears with the friendly label and technical details
3. You **Approve** or **Reject**

- Approval covers tools that change the document, including: `edit_doc_text`,
  `edit_doc_list`, `collapse_blank_paragraphs`, `write_range`, `format_range`,
  `insert_rows_columns`, `delete_rows_columns`, `merge_cells`, `clear_range`,
  `sort_range`, `set_column_width`, `set_row_height`,
  `modify_presentation_structure`, `insert_slide_element`,
  `remove_slide_element`, `edit_slide_text`, `edit_slide_xml`, `format_shape`,
  and `execute_office_js`.
- Read-only tools run without prompting.
- Rejecting a tool feeds a "user rejected this tool call" result back to the
  model so it can adapt rather than repeat the call.

::: tip Why
It's your document. The model proposes, you decide; useful for anything you
can't easily undo.
:::

## Reasoning visibility

While the model thinks, its chain-of-thought streams into a **clickable
"reasoning" block** at the top of the reply:

- **`▸ thinking`** while reasoning is in progress
- **`▸ reasoning`** once content arrives; click to expand the full thinking
- Expanded reasoning shows the model's actual deliberation before it acted

Reasoning is captured per provider: `reasoning_content` (chat-completions),
`response.reasoning_text.delta` / `reasoning_summary_text.delta` (Responses),
`thinking_delta` (Anthropic), and thought parts (Gemini).

How much the model thinks is configurable via **Settings → Advanced →
Reasoning Effort** (off by default); see
[Configuration](/docs/configuration#reasoning-effort).

## Ask user questions

When the model needs your input before acting, it presents **tappable option
cards** via the `ask_user_question` tool instead of guessing:

- 1–4 questions per card, each with a header, question, and 2–4 options
- **Other** option: click it and type your own answer
- Multi-select questions join selections (including an "Other" custom value)
- Answers are sent back as `[Header] answer` lines so the model knows exactly
  what you chose

## Prompt caching

Long conversations repeat a large system prompt + history prefix. Where the
provider supports it, OpenDocBot enables server-side caching automatically to
cut cost and latency. Support and settings differ per provider; see
[Providers](/docs/providers#prompt-caching) for the general explanation and
[Configuration](/docs/configuration#prompt-caching) for the settings.

## Debug export

One click copies the whole session for troubleshooting:

- A **markdown export** (`# OpenDocBot Debug Export`) with message counts
- The full **debug log** (timestamps, provider cache info, tool traces)
- Every user/assistant message, with reasoning in a `<details>` block and tool
  calls with (truncated) arguments

Paste it into an issue or a chat with the maintainers; it contains everything
needed to reproduce a bad turn.

## Resilience

- **Stream timeouts**: the SSE stream aborts after 120 s idle or 10 min total,
  surfacing a real error instead of hanging.
- **Provider errors**: `response.failed` / `error` events reject the stream
  with the provider's message.
- **Truncation notice**: if the model hits the output token limit, the reply is
  flagged with a note to raise Max Tokens.
- **Empty-response guard**: a genuinely empty reply (no content, no tool) shows
  a visible note instead of silent nothing; tool-driven turns (like questions)
  never trigger it.
- **Thrash guard**: repeated identical tool failures stop the loop.

## Word & Excel specifics

- **Selection context**: text you highlight before typing is passed as
  `<user_selection>` and beats the whole-document state for ambiguous requests
  ("fix this", "make it bold").
- **Paragraph markers**: `<doc_state>` marks headings, lists, page breaks and
  images so the model understands structure, not just text.

## PowerPoint specifics

- **No selection API**: PowerPoint.js has none, so there's never a
  `<user_selection>` block; ambiguous slide references are asked or resolved to
  the most recently used slide.
- **Re-import caveat**: OOXML write-backs (`edit_slide_text`, `edit_slide_xml`)
  re-import the slide and **reassign slide/shape ids**; the tool returns a
  warning to re-run `list_slide_shapes` before further edits.
- **Stacking order (z-order)**: `list_slide_shapes` reports each shape's
  `order` (0 is the back, highest is the front). Full-bleed shapes added with
  `insert_slide_element` are automatically placed at the back, so backgrounds
  never cover text; pass `z_order: "back"` to force it for other shapes.
  `verify_slides` flags `z_order_warnings` when a background is stacked in
  front of content it hides.
- **Verification**: `verify_slides` checks overlaps, out-of-bounds shapes,
  WCAG text contrast, and z-order problems after styling.
