---
title: Self-hosting
description: Run OpenDocBot on your own infrastructure. Docker, Node, or any static host, with HTTPS, the proxy, and production manifests.
---

# Self-hosting

Self-hosting runs the add-in's web app on your own infrastructure. It's the
option that unlocks the **proxy** (needed for providers without browser CORS,
like OpenCode) and full control over the deployment.

::: info
The app itself is **static**: `dist/` is just HTML + hashed JS/CSS. The
**proxy** is an optional server-side request forwarding functionality. It's used
to reach providers that block browser origins (CORS). **Without the proxy**, the
hosted app works fine for providers that allow browser access (OpenAI, DeepSeek, Gemini,
Anthropic, OpenRouter).
:::

## Prerequisites

These steps apply to every self-hosting option below. (The Docker image
installs its own dependencies at build time, so `npm install` is only needed for
Options 2 and 3.)

Clone the repo:

```bash
git clone https://github.com/OpenDocBot/OpenDocBot.git
cd OpenDocBot
```

All OpenDocBot services listen on a single port, **3000**. Office refuses to load
an add-in served over plain HTTP, so HTTPS is **strictly required**. You therefore need a TLS certificate trusted on
the machine where the add-in will run.

::: details How to generate a self-signed trusted certificate

Generate one with
[mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install
mkcert -key-file ~/.opendocbot-key.pem -cert-file ~/.opendocbot-cert.pem localhost
```
:::

Each option below wires this certificate into its own server: Docker takes it as
base64 in `.env`, and Node reads it from the default files above.

## Option 1: Docker (recommended)

The simplest way to self-host is Docker Compose. From the repo root, make a copy
of the example env file:

```bash
cp .env.example .env
```

Edit the new `.env` file to configure the application. Use your preferred text editor.

Every variable is listed in [Environment variables](#environment-variables)
below. At minimum, configure `TLS_CERT` and `TLS_KEY` (see the HTTPS note below):

::: details HTTPS Note

The container serves `https://localhost:3000` using the certificate and key you
provide. Set them in your `.env` as base64-encoded PEM (these are the same certs
you generated in [Prerequisites](#prerequisites)):

```bash
base64 -w0 path/to/cert.pem   # paste the output into TLS_CERT=
base64 -w0 path/to/key.pem    # paste the output into TLS_KEY=
```

```dotenv
TLS_CERT=<base64 of cert.pem>
TLS_KEY=<base64 of key.pem>
```

The container decodes the base64 values and serves HTTPS.

:::

::: details Request proxy feature

`VITE_PROXY_ENABLED` is a **build-time** variable baked into the JS bundle by
the Dockerfile. It is **not** read from `.env` at runtime, so it cannot be toggled
from the `.env` file; the Docker image always builds with the proxy enabled.

:::

Then you are ready to spin up the application with:
```bash
docker compose up -d --build
```

The application container image will be automatically built and deployed. 

The container listens on port **3000** and the host maps the same port by
default, so the add-in is served at `https://localhost:3000`. If port 3000 is
already in use on the host, expose a different host port with
`OPENDOCBOT_HOST_PORT`.

If you're running the application server on the same machine as the add-in, use the default [`manifest.xml`](https://github.com/OpenDocBot/OpenDocBot/blob/main/manifest.xml) provided in the repo (it defaults to `localhost`). Otherwise, generate a production `manifest.xml` file (see [here](/docs/selfhosting#production-manifest)).

## Option 2: Node directly

Run the add-in with Node. No container required. Same proxy behavior as the
Docker image, but on the host directly.

Install dependencies (from the repo root):

```bash
npm install
```

Make a copy of the example env file and configure it:

```bash
cp .env.example .env
```

The Node server (`scripts/serve.mjs`) reads the same variables as the container
(see [Environment variables](#environment-variables)): at minimum `PORT`
(default `3000`), `HOST`, `DIST_DIR`, plus the TLS cert/key. Provide the
certificate either via the `TLS_CERT` / `TLS_KEY` env vars (base64-encoded PEM,
as in Option 1) or by leaving the default files created in
[Prerequisites](#prerequisites) at `~/.opendocbot-cert.pem` and
`~/.opendocbot-key.pem`.

Then build with the proxy enabled and serve:

```bash
make serve
# equivalent to:
#   VITE_PROXY_ENABLED=true npm run build
#   node scripts/serve.mjs
```

This serves the app at `https://localhost:3000`. To use a different port, set
`PORT` in your `.env` (or prefix the command):

```bash
PORT=4000 node scripts/serve.mjs   # serves on https://localhost:4000
```

## Option 3: Any static host (no proxy)

For a proxy-less deployment, serve the built app on any static hosting service
(Netlify, Vercel, S3, nginx, GitHub Pages, etc.). There is **no `.env` file and no
server-side TLS here**: HTTPS is provided by your static host, and each user
configures their provider keys in the add-in's Settings (stored in their
browser).

Install dependencies (from the repo root) and build with the proxy disabled:

```bash
npm install
VITE_PROXY_ENABLED=false npm run build
```

Then upload the `dist/` folder to your static host and serve it over HTTPS.

The proxy checkbox is hidden in this build. OpenCode won't work here; the
CORS-friendly providers (OpenAI, DeepSeek, Gemini, Anthropic, OpenRouter) will.

## Production manifest

- The repo-root [`manifest.xml`](https://github.com/OpenDocBot/OpenDocBot/blob/main/manifest.xml) points at `https://localhost:3000` (the HTTPS dev
  server). It can be used for local sideloading.
- For a hosted instance, generate a production manifest:

```bash
OPENDOCBOT_URL=https://addin.example.com node scripts/build-manifest.mjs
```

This writes [`dist/manifest.xml`](https://github.com/OpenDocBot/OpenDocBot/blob/main/manifest.xml) with `SourceLocation` and icon URLs pointing at
your host. Share that manifest with your users (sideload it, or distribute via
your own channel).


### Security note

When using proxy mode, user API keys pass directly through your server before reaching the provider. If hosting a multi-user deployment, protect your server with standard security measures (e.g., HTTPS and authentication) and restrict access so traffic only flows through trusted instances.

## Enterprise features

Two features are aimed at organizations that host OpenDocBot for a team:

- **[SSO](/docs/enterprise/sso)**: put the instance behind your identity
  provider with OIDC. Once enabled, the taskpane shows a sign-in gate and the
  managed config is only served to authenticated users.
- **[Managed configuration](/docs/enterprise/managed-configuration)**: force a
  subset of the add-in settings for every user, served same-origin from
  `/app-config.json`.

## Environment variables

All variables are optional except where noted. Runtime variables are read by
`scripts/serve.mjs` (Docker and Node); build-time variables are baked into the
bundle and cannot be changed at runtime; manifest variables are used by
`scripts/build-manifest.mjs`.

| Variable | Default | Scope | Usage |
|---|---|---|---|
| `OPENDOCBOT_HOST_PORT` | `3000` | Docker Compose | Host port mapped to the container's port 3000. |
| `PORT` | `3000` | Runtime | Server listen port. |
| `HOST` | `0.0.0.0` | Runtime | Bind address. |
| `DIST_DIR` | `dist/` (Node), `/app/dist` (Docker) | Runtime | Directory of the built app to serve. |
| `TLS_CERT` | `~/.opendocbot-cert.pem` (Node) | Runtime | HTTPS certificate. A file path, or the PEM/base64 contents (Docker passes base64). Required for HTTPS. |
| `TLS_KEY` | `~/.opendocbot-key.pem` (Node) | Runtime | Matching private key. Same accepted forms as `TLS_CERT`. Required for HTTPS. |
| `OPENDOCBOT_MANAGED_CONFIG` | - | Runtime | Inline JSON of forced settings. See [Managed configuration](/docs/enterprise/managed-configuration). |
| `OPENDOCBOT_MANAGED_CONFIG_FILE` | - | Runtime | Path to a JSON file with the forced settings (alternative to the inline value). |
| `OPENDOCBOT_MANAGED_REQUIRE_SSO` | `true` | Runtime | Refuse to start if a managed config is set without OIDC. Set to `false` to allow an intentionally open config. |
| `OPENDOCBOT_OIDC_ISSUER` | - | Runtime | OIDC issuer URL. Enables SSO when set. See [SSO](/docs/enterprise/sso). |
| `OPENDOCBOT_OIDC_CLIENT_ID` | - | Runtime | OIDC client id of the registered application. |
| `OPENDOCBOT_OIDC_CLIENT_SECRET` | - | Runtime | OIDC client secret. Optional for a public PKCE client. |
| `OPENDOCBOT_OIDC_SCOPES` | `openid profile email offline_access` | Runtime | Space-separated OIDC scopes. Keep `offline_access` to receive a refresh token. |
| `OPENDOCBOT_OIDC_REDIRECT_URI` | computed as `https://<host>/auth/callback` | Runtime | Override the redirect URI (needed behind a proxy). Must match the IdP registration. |
| `OPENDOCBOT_OIDC_ALLOWED_GROUPS` | empty (any authenticated user) | Runtime | Comma-separated group object IDs allowed to sign in. |
| `OPENDOCBOT_OIDC_GROUPS_CLAIM` | `groups` | Runtime | ID token claim that carries group membership (list or single string). |
| `OPENDOCBOT_SESSION_STORE` | `~/.opendocbot-sessions.json` (Node), `/data/opendocbot-sessions.json` (Docker) | Runtime | Session store file. Must survive restarts. |
| `OPENDOCBOT_SESSION_SECRET` | auto-generated next to the store | Runtime | Key that encrypts stored refresh tokens. |
| `VITE_PROXY_ENABLED` | `false` | Build | Bakes the server-side proxy into the bundle. The Docker image always builds with it enabled. |
| `VITE_BASE` | `/` | Build | Base path for assets (used for GitHub Pages project sites). |
| `VITE_CONFIG_EXPORT_EXCLUDE` | - | Build | Comma-separated setting keys to exclude from configuration exports. |
| `OPENDOCBOT_URL` | derived from `GITHUB_REPOSITORY` | Manifest | Deployment URL written into `dist/manifest.xml`. |
| `OPENDOCBOT_APP_PATH` | - | Manifest | Sub-path appended to the manifest URLs. |
| `OPENDOCBOT_VERSION` | `1.0.0.0` | Manifest | Version written into the manifest. |
| `GITHUB_REPOSITORY` | - | Manifest | Used to derive the GitHub Pages URL when `OPENDOCBOT_URL` is unset. |

