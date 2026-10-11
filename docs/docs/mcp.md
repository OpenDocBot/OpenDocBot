---
title: MCP servers
description: Connect external tools and data to OpenDocBot through MCP. Add a server, choose how it authenticates, enable it per conversation, and review every call with human-in-the-loop.
---

# MCP servers

**MCP** (Model Context Protocol) lets the assistant use **tools from outside
Office**: search your repositories, look up a database, call your own service,
and so on. You add a server once, and the model can call the tools it exposes,
right next to the built-in document tools.

Everything runs in your browser. OpenDocBot does not proxy the requests: the
task pane talks to the MCP server directly, with the same client-side, no
lock-in approach as the rest of the app.

::: tip New to MCP?
An MCP server is a small web service that exposes **tools** (actions) a model can
call. You do not write any code to use one. If you have a server URL, you can add
it here.
:::

## How it works

- **Transport**: OpenDocBot speaks the **Streamable HTTP** transport. The server
  URL is the MCP endpoint, for example `https://mcp.example.com/mcp`.
- **Tools only**: it uses the server's **tools**. Resources and prompts are not
  used.
- **Names**: each tool is namespaced as `mcp__<server>__<tool>`, so it can never
  clash with the built-in tools. In the chat, MCP tools appear with an `[MCP]`
  prefix.
- **On demand**: OpenDocBot connects to a server when you enable it in a
  conversation, lists its tools, and the model calls them like any other tool.

## Adding a server

1. Open the add-menu: the **+** next to the chat input.
2. Choose **MCP servers**.
3. Choose **New server**.
4. Fill in:

   | Field | What it is |
   |---|---|
   | **Name** | A label for you. It also drives the tool prefix. |
   | **Server URL** | The MCP endpoint, an `https://` URL. |
   | **Authentication** | How the server checks who you are (see below). |

5. Press **Test** to check the connection. A working server shows **Connected**
   and how many tools it exposes.
6. Press **Save**.

Your servers are listed in the same panel. Tick a server's checkbox to enable it
for the current conversation.

## Authentication

| Option | Use it when | What you enter |
|---|---|---|
| **No auth** | The server is public. | Nothing. |
| **API key / bearer** | The server expects a key or token in a header. | The **Header** (defaults to `Authorization`) and the **Value**, for example `Bearer ghp_...`. |
| **OAuth** | The server signs you in with your own account. | Usually nothing, if the server supports dynamic registration. Otherwise a **Client ID** and, if it has one, a **Client Secret**. |

### OAuth

OAuth servers sign you in through your browser and keep access scoped to your
account:

- **Dynamic registration (DCR)**: most servers let OpenDocBot register itself
  automatically. Leave **Client ID** and **Client Secret** empty and press
  **Connect**.
- **Static client**: some servers, GitHub for example, do not support dynamic
  registration. You create an app at the provider, register the callback URL
  below, and paste its **Client ID** and, if it has one, its **Client Secret**.
- **Callback URL** to register at the provider:
  - Hosted app: `https://opendocbot.com/auth/mcp.html`
  - Local development: `https://localhost:3000/auth/mcp.html`
- **Where the token goes**: sign-in happens in a popup and the token is stored
  **in your browser** (`localStorage`), never sent to OpenDocBot. After signing
  in, the button shows **Connected**. Use **Reconnect** to sign in again, or
  **Disconnect** to forget the token.

::: warning OAuth tokens are personal
A token is tied to your account and to the permissions you granted. OpenDocBot
never exports it, and it stays on this device. Sign in again on each device where
you want to use the server.
:::

## Enabling servers per conversation

Enabling is **per conversation**, not global. Tick a server to make its tools
available to the model for the current chat:

- The add-menu shows how many servers are enabled next to **MCP servers**.
- Enabling a server means the model can call its tools. You can turn one off at
  any time.
- Clearing the conversation resets the enabled servers.

## Human in the loop

When **Human in the Loop** is on (Settings, Behavior tab), every **MCP tool call
pauses for your approval** before it runs. This is on purpose: an MCP tool can do
anything the server allows, so OpenDocBot treats it like a document-changing
action and lets you decide.

Read the proposal in the approval card, then **Approve** or **Reject**. A
rejected call is reported back to the model so it can adapt. See
[Human in the Loop](/docs/features#human-in-the-loop).

## Sharing servers

You can export your server list and import it on another machine:

- **Export servers** downloads `opendocbot-mcp-servers.json`. Secrets are **left
  out** by default, so you re-enter them after importing.
- **Include credentials**, a checkbox in the export dialog, adds the **API key
  value** and the **OAuth client secret** to the file, and names it
  `opendocbot-mcp-servers-with-credentials.json`. The file is plain text, so
  store it carefully and delete it when you are done.
- **OAuth tokens are never exported.** They are personal and device-bound, so you
  sign in again after importing.
- **Import servers** merges a file into your list, matching by URL. A server you
  already have keeps its settings, and a saved secret is kept when the imported
  entry does not include one.

## Examples

A few servers you can try. They are third-party services, so check their terms
before you connect.

| Server | URL | Authentication |
|---|---|---|
| **DeepWiki** | `https://mcp.deepwiki.com/mcp` | No auth. |
| **GitHub** | `https://api.githubcopilot.com/mcp/` | API key / bearer with a personal access token, or OAuth. |
| **Linear** | `https://mcp.linear.app/mcp` | OAuth (dynamic registration). |
| **Notion** | `https://mcp.notion.com/mcp` | OAuth (dynamic registration). |

### GitHub with a token

1. Create a **fine-grained personal access token** in GitHub with the scopes you
   need, for example repository read access.
2. Add a server with URL `https://api.githubcopilot.com/mcp/` and
   **Authentication: API key / bearer**.
3. Header `Authorization`, value `Bearer <your token>`. Press **Test**, then
   **Save**.

### GitHub with OAuth

GitHub does not offer dynamic registration, so you register your own client:

1. In GitHub, create a **GitHub App** or an **OAuth App** with the callback URL
   `https://opendocbot.com/auth/mcp.html`, or the localhost URL while developing.
2. Add a server with URL `https://api.githubcopilot.com/mcp/` and
   **Authentication: OAuth**.
3. Paste the app's **Client ID** and, if it has one, its **Client Secret**, then
   press **Connect**.

## Limitations

- **Browser CORS**: the add-in runs in your browser, so the MCP server must allow
  browser-origin requests (CORS). If it does not, the connection fails with a
  network or CORS error. This is the most common reason a server will not
  connect.
- **Origin allowlists**: some servers check the exact browser origin and reject
  anything they do not recognize. Cloudflare's hosted MCP
  (`https://mcp.cloudflare.com/mcp`) is one example: it allows only localhost and
  non-browser clients, so it works from a local (self-hosted) instance but not
  from a hosted origin. You cannot change the origin the browser sends, so a
  server like this cannot be used from a hosted deployment.
- **Tools only**: OpenDocBot uses the server's tools. Resources and prompts are
  not used.
- **Streamable HTTP only**: the older HTTP+SSE transport is not supported.
- **Client-side**: requests go straight from your browser to the MCP server.
  OpenDocBot does not proxy them.

::: warning Only add servers you trust
An MCP tool runs with whatever access the server has, and its results are fed to
the model as data. Add only servers you trust, and keep Human in the Loop on if
you want to review each call.
:::
