---
title: "Self-Hosting OpenDocBot for Microsoft 365"
description: "Self-host OpenDocBot for Microsoft 365. One script sets up TLS, Docker and the manifest. Self-hosting also unlocks SSO and managed configuration."
ogImage: /og/blog-selfhosting.png
ogImageAlt: "Self-hosting OpenDocBot for Microsoft 365: your server, your identity provider, your configuration."
pageClass: blog-post
date: "2026-11-11"
sidebar: false
outline: false
prev: false
next: false
---

# Your Office Harness, on your own terms

Self-hosting the Microsoft 365 add-in for teams

By OpenDocBot · November 11, 2026

[Back to all posts](/blog/)

OpenDocBot is a Microsoft 365 add-in for Word, Excel and PowerPoint. It already runs client-side, so your documents go from Office to the model provider you choose, not through us. Self-hosting is about a different kind of control: where the add-in is served, who can open it, and what settings everyone gets.

For a team, that difference matters. The hosted add-in is easy to [try](/docs/quickstart#_1-install-from-the-microsoft-marketplace). A self-hosted instance is something IT can put behind the company domain, the company identity provider and one shared configuration.

## What self-hosting changes

<div class="selfhost-grid">
  <div class="selfhost-card">
    <h3>Your server</h3>
    <p>Office loads the add-in from your hostname. You choose the network, the certificate and when to update.</p>
  </div>
  <div class="selfhost-card">
    <h3>Your identity provider</h3>
    <p>Put the add-in behind Entra ID, Okta, Keycloak, Auth0 or Google. Only the groups you allow can open it.</p>
  </div>
  <div class="selfhost-card">
    <h3>Your configuration</h3>
    <p>Set the provider, model and API key once. Every user gets the same managed setup, with no manual configuration.</p>
  </div>
</div>

::: tip Same product, not a different edition
Self-hosting is not an enterprise-only build. The same add-in runs on your infrastructure. Teams of up to 30 users can use it for free, including SSO and managed configuration.
:::

The server is the control plane, not a mandatory data path. It serves the add-in, handles sign-in and delivers configuration. Model requests still go from the user's Office client to the provider you configure. If you need to route model traffic through your own gateway, the optional proxy is there. Most teams start without it.

<div class="blog-demo">
  <SelfHostDiagram />
</div>

## One script, one working instance

The repository includes a guided setup script. Clone the repo, run it, and answer a few questions.

```bash
git clone https://github.com/OpenDocBot/OpenDocBot.git
cd OpenDocBot
./setup.sh
```

<div class="blog-demo">
  <TerminalDemo />
</div>

The wizard does five things:

1. **Address and certificate.** It detects the hostname or IP, asks for the port and generates a self-signed certificate unless you provide one.
2. **Configuration.** It writes `.env` with a strong session secret and, if you want, SSO settings. Managed configuration is a separate `.env` setting added after setup.
3. **Manifest.** It builds `dist/manifest.xml` for your hostname.
4. **Summary.** It shows the URL, certificate, environment file and manifest path.
5. **Start and verify.** It starts Docker Compose, waits for the health check and confirms that HTTPS answers.

It asks only for what it needs. For an internal runbook or automation, the non-interactive form takes the same values up front:

```bash
./setup.sh --yes --host addin.example.com \
  --cert /etc/letsencrypt/live/addin.example.com/fullchain.pem \
  --key /etc/letsencrypt/live/addin.example.com/privkey.pem
```

For a pilot, the generated self-signed certificate is fine. For production, pass a certificate your clients already trust. If the certificate is self-signed, the script prints the trust commands for Linux, Windows, macOS and Chromium Snap.

## What the script writes

| File | Why it matters |
|---|---|
| `certs/addin.crt` | The certificate Office loads. The script generates it or installs the one you pass. |
| `certs/addin-key.pem` | The matching private key. It stays in `certs/` and is not committed. |
| `.env` | Port, session secret and optional SSO settings. Managed configuration can be added later. Written with mode `0600`. |
| `dist/manifest.xml` | The file you upload to the Microsoft 365 admin center. It points Office at your hostname. |

Everything lives in the repository root, so backups and migrations are straightforward.

## After setup: manifest, SSO and managed configuration

Three steps remain:

1. If the certificate is self-signed, trust it on every client that opens the add-in. The script prints the exact commands.
2. Upload `dist/manifest.xml` to the Microsoft 365 admin center, then assign the add-in to users or groups.
3. If you skipped SSO in the wizard, add the `OPENDOCBOT_OIDC_*` settings to `.env` and restart. To set the provider, model and API key once for everyone, add `OPENDOCBOT_MANAGED_CONFIG` or `OPENDOCBOT_MANAGED_CONFIG_FILE` to `.env` and restart. Managed configuration requires SSO.

The [self-hosting guide](https://opendocbot.com/docs/selfhosting) covers certificate trust, renewal, the manual Docker path, Node and static hosting. The [SSO](https://opendocbot.com/docs/enterprise/sso) and [managed configuration](https://opendocbot.com/docs/enterprise/managed-configuration) guides cover the team settings.

## Who this is for

Self-hosting fits teams that already run internal infrastructure and need one or more of these:

- A company hostname instead of a shared public endpoint.
- Sign-in through the company identity provider.
- One approved provider, model and API key for everyone.
- A deployment their security team can review and operate.

If you just want to try OpenDocBot, [install it from the Microsoft Marketplace](/docs/quickstart#_1-install-from-the-microsoft-marketplace). Self-host when you need the control surface.

OpenDocBot does not mark up model usage; you pay your provider directly. Self-hosting, SSO and managed configuration are included in the free tier for up to 30 users. Above that, a [commercial license](/enterprise) covers usage rights and support, not a different feature set.

## What's next

- [Self-hosting guide](https://opendocbot.com/docs/selfhosting)
- [SSO](https://opendocbot.com/docs/enterprise/sso)
- [Managed configuration](https://opendocbot.com/docs/enterprise/managed-configuration)
- [Book a 20-minute intro](https://cal.com/opendocbot/intro)

If you want a hand with the first deployment, tell us at [hello@opendocbot.com](mailto:hello@opendocbot.com).
