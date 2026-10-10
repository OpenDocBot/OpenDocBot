---
title: Skills
description: Reusable procedures you make available per Office app in OpenDocBot. The model loads a skill's instructions on demand, or you invoke it with a slash command. Import and export skills as standard SKILL.md files.
---

# Skills

**Skills** are reusable procedures you make available from the chat: a review
checklist, a brand-voice guide, a data-cleaning workflow. They follow the open
[Agent Skills](https://agentskills.io) model: a skill's name and description are
advertised to the model, and its instructions load only when they are actually
needed.

Skills are not always-on rules. Where [Custom Instructions](/docs/features#custom-instructions)
apply to every turn, a skill is opt-in and loaded on demand.

## Availability per app

A skill is available only in the Office apps you choose, so a Word skill never
clutters Excel and vice versa. In the skill editor, tick the apps where the
skill applies: **Word**, **Excel** or **PowerPoint**. New skills
default to all three.

In the skills panel, each skill shows its app badges (`W` `X` `P`); skills that
don't apply to the app you're in are dimmed. The model only ever sees the skills
available in the current app.

## Using a skill

A skill's text is not loaded just because it's available; only its name and
description are advertised, so the model knows it exists:

1. **Discovery**: the model sees the `name` and `description` of every skill
   available in the current app.
2. **Activation**: when your request matches a skill's description, the model
   loads its full instructions (via the `load_skill` tool) and follows them. You
   can also invoke a skill yourself by typing `/` in the input and picking it
   (or typing `/slug`). Text after the command becomes the request.
3. **Execution**: the model carries out the procedure using its normal tools,
   including `execute_office_js`.

Because only the description is kept in context until a skill is used, you can
keep a large library with a small context footprint.

## Writing a skill

| Field | Required | Notes |
|---|---|---|
| **Name** | yes | Shown in the menu, up to 60 characters. Also drives the slug used to invoke it (e.g. `Concise answers` → `/concise-answers`). |
| **Description** | yes | What it does and when to use it (up to 1,024 characters). This is the activation hint the model matches against, so be specific. |
| **Instructions** | yes | The procedure loaded when the skill is activated (up to 8,000 characters). |
| **Available in** | yes | Word, Excel and/or PowerPoint (at least one). |

::: tip Office.js snippets as reference
A skill's instructions are plain text, so you can include **Office.js code
snippets** for the model to use as reference, for example a batch of formatting
calls or a known-good pattern to adapt. The model can run them through
`execute_office_js` . This is the closest equivalent to the standard's 
bundled scripts, which OpenDocBot does not execute.
:::

## Sharing skills

Skills use the open [Agent Skills](https://agentskills.io) format, so they work across tools (Claude Code,
Cursor, GitHub Copilot, and more):

- **Export skills** downloads `opendocbot-skills.zip`, one `<slug>/SKILL.md`
  entry per skill.
- **Import skills** reads a `.zip` pack or a single `SKILL.md` and merges it into your library by slug.

A `SKILL.md` is YAML frontmatter plus a Markdown body. The app scope is stored in
`metadata.hosts` (a comma-separated list, always written; if absent on import the
skill is available in every app):

```markdown
---
name: concise-answers
description: Short answers for busy readers.
metadata:
  display-name: Concise answers
  hosts: word,excel
---

Be concise. Prefer short sentences and bullet points.
```

::: warning Skills are instructions
A skill's instructions are followed by the model with the same trust as your
own. Only import skills from people you trust, and review a skill before making
it available.
:::

## Differences from the full standard

OpenDocBot runs in the Office task pane, without a filesystem or a code sandbox.
Skills here are therefore **instructions only**: the optional `scripts/`,
`references/`, and `assets/` of the full specification are not executed or
loaded. Work that the standard would put in a script is done through the
document tools instead (for example `execute_office_js`).

Skills are stored in your browser only, alongside the rest of your settings; no
skill content is sent anywhere until it is activated in a message.
