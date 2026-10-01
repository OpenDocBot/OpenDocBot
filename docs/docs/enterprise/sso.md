---
title: Single Sign-On
description: Require users to sign in with your organization's identity provider before the add-in loads.
---

# Single Sign-On

Organizations may require users to sign in with the organization's identity
provider (Microsoft Entra ID, Keycloak, Auth0, Okta, Google, and others) before
the add-in can be used. This allows the secure setup of [managed configuration](/docs/enterprise/managed-configuration) (i.e. company API keys), and
controls who can use the add-in via identity provider group membership.

This feature is available on self-hosted instances only.

## What you need

- A self-hosted OpenDocBot instance served over HTTPS.
- An application registered at your identity provider as a web app, with the
  redirect URI `https://<your-host>/auth/callback`.
- The **issuer URL**, **client ID**, and (usually) **client secret** from that
  application. These values are obtained when registering the application in your IdP.

## Configure

Add these to your server's `.env`:

```dotenv
OPENDOCBOT_OIDC_ISSUER=https://your-provider/...
OPENDOCBOT_OIDC_CLIENT_ID=your-client-id
OPENDOCBOT_OIDC_CLIENT_SECRET=your-client-secret
```

Restart the server. Users are now asked to sign in, and only signed-in users can
load the add-in. Sign-in is remembered, so users do not have to sign in on every
visit. If you want to restrict the add-in usage to a particular IdP group, see the [section below](/docs/enterprise/sso#optional-limit-access-to-certain-groups).

To enforce a particular add-in configuration to end users (i.e. company LLM gateway and API key), see the [managed configuration](/docs/enterprise/managed-configuration) section.


### Behind a reverse proxy

If a reverse proxy sits in front of the OpenDocBot server, the redirect URI can not be automatically
derived. Set the callback URL explicitly in the server's `.env` file:

```dotenv
OPENDOCBOT_OIDC_REDIRECT_URI=https://addin.example.com/auth/callback
```

Otherwise the identity provider will reject the sign-in with a `redirect_uri_mismatch` error.


## Access control via IdP group membership

By default, any user who can sign in with your provider gets access to the
add-in. To restrict access to specific groups, set
`OPENDOCBOT_OIDC_ALLOWED_GROUPS` to the values to allow, separated by commas.

Group membership is read from the ID token claim named `groups`. The value can be
a list of strings or a single string, and each value is matched against the
allowed list exactly, ignoring case. Providers that use a different claim name
can override it with `OPENDOCBOT_OIDC_GROUPS_CLAIM`, for example a namespaced
Auth0 claim or `memberOf`.

Your provider must include the groups in the ID token, or every sign-in is
refused. How you enable that depends on the provider. For Entra ID, see
[Microsoft Entra ID](/docs/enterprise/entra-id#_4-add-the-groups-claim).

If a sign-in is refused, the server logs why (the group check failed, with the
claim name, the allowed values and the received values).

## Sessions and storage

- Sign-in state is kept server-side in `OPENDOCBOT_SESSION_STORE` (default
  `~/.opendocbot-sessions.json`; `/data/opendocbot-sessions.json` in Docker). It
  must survive restarts, or every user has to sign in again.
- That store is intended for a **single server instance**. Running several
  replicas behind a load balancer needs a shared session store; each process
  keeps its own sessions otherwise.
- Refresh tokens are encrypted at rest with `OPENDOCBOT_SESSION_SECRET`. Leave it
  empty to auto-generate a strong key next to the store, or set it to a
  high-entropy secret (e.g. `openssl rand -base64 32`). Do not use a human
  passphrase.
- Keep `offline_access` in the scopes (the default) so the server can refresh a
  session without sending the user back to the provider.

## Good to know

- SSO is self-hosted only. Your server talks to your identity provider; your
  provider's credentials never pass through OpenDocBot.
- Enabling SSO also protects
  [Managed configuration](/docs/enterprise/managed-configuration), which can
  contain a provider API key.
- On an SSO instance, the server-side proxy (`/proxy/`) also requires a session,
  so the add-in can never be used as an open relay.

## Provider guides

- [Microsoft Entra ID](/docs/enterprise/entra-id)

