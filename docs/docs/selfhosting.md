---
title: Self-hosting
description: Run OpenDocBot on your own infrastructure with Docker, Node, or a static host. Includes SSO, managed configuration, HTTPS and add-in deployment.
---

# Self-hosting

Run OpenDocBot on your own infrastructure, with the control your team needs.
Self-hosting enables:

- **[SSO](/docs/enterprise/sso):** require sign-in with your organization's
  identity provider before the add-in loads.
- **[Managed configuration](/docs/enterprise/managed-configuration):** set the
  provider, API key and model once for everyone on the instance.

You keep control of the server, your data and updates. Office only loads the
add-in over HTTPS, so every path below includes TLS.

Here is the shape of a self-hosted deployment:

<SelfHostDiagram />

For a narrative walkthrough of the same flow, see [Your Office Harness, on your own terms](/blog/selfhosting-opendocbot).

The commands included in this guide target **Ubuntu Server LTS**. They should work on other Linux
distributions, macOS, or Windows with WSL2 with small adjustments. Requirements
depend on the path you choose.

## Choose a path

Pick the path that matches how much you want to manage.

- **Guided setup (recommended):** best for most deployments. The script handles
  certificates, `.env`, the manifest and Docker Compose.
- **Manual Docker Compose:** for operators who want to manage `.env` and `certs/`
  themselves.
- **Node directly:** for hosts without Docker. You manage the Node process and
  TLS.
- **Static host:** the simplest option, with no server-side features.

::: tip
Not sure which path to take? Start with the guided setup.
:::

::: details Guided setup (recommended)

**Tested on:** Ubuntu Server LTS. **Requires:** Docker Engine with Compose v2,
OpenSSL 1.1.1 or newer, curl, and Node.js 20.6 or newer to generate the manifest.

On your server:

```bash
git clone https://github.com/OpenDocBot/OpenDocBot.git
cd OpenDocBot
./setup.sh
```

The wizard walks the user through the setup steps:

<TerminalDemo />

The wizard asks only for what it needs: the IP address, port, certificate and
optional SSO. It generates/writes the certificate files, builds your configuration file at  `.env` and the addin manifest at `dist/manifest.xml`,
then starts the container and checks that the app responds.

The wizard can configure SSO. Managed configuration is a separate `.env` setting added after setup; see [Managed configuration](/docs/enterprise/managed-configuration).

This script also supports non-interactive mode, which allows the user to apply this configuration with a single command. Examples:

```bash
# Internal test on a LAN IP, self-signed certificate
./setup.sh --yes --host 192.168.1.10

# Production with a DNS name and a real certificate
./setup.sh addin.example.com \
  --cert /etc/letsencrypt/live/addin.example.com/fullchain.pem \
  --key /etc/letsencrypt/live/addin.example.com/privkey.pem
```

If you pass a DNS name without `--cert` and `--key`, the script generates a
self-signed certificate for that name. That is fine for a quick test, but public
clients will not trust it. Use a real certificate for production.

After setup:

1. If the certificate is self-signed, make sure  every client trusts it. See
   [Certificates and HTTPS](#certificates-and-https).
2. Upload `dist/manifest.xml` to the Microsoft 365 admin center. See
   [Generate and deploy the manifest](#generate-and-deploy-the-manifest).
3. Check the container:

```bash
docker ps --filter name=opendocbot
docker logs -f opendocbot
```

::: tip Windows
`setup.sh` is a Bash script. On Windows, run it from WSL2, or use the manual
Docker Compose path with Docker Desktop. Native PowerShell is not supported.
:::

::: details Manual Docker Compose

**Requirements:** Docker Engine with Compose v2 and Node.js 20.6 or newer for the
manifest. You also need OpenSSL if you generate a self-signed certificate.

This path assumes you are comfortable editing `.env` and placing files in
`certs/`.

**1. Create `.env`**

```bash
cp .env.example .env
```

Review `OPENDOCBOT_HTTPS_PORT`. If you want to set the session secret yourself:

```bash
openssl rand -base64 32
```

Paste the value into `OPENDOCBOT_SESSION_SECRET`, or leave it empty to let the
server generate one.

**2. Put the certificate in `certs/`**

The compose file expects:

```text
certs/
  addin.crt       server certificate first, then intermediates
  addin-key.pem   unencrypted private key
```

See [Certificates and HTTPS](#certificates-and-https) for real certificates,
self-signed certificates, permissions and renewal.

**3. Start the container**

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f opendocbot
```

The app is served at `https://<host>:<port>`. With the default port, that is
`https://<host>`.

**4. Generate the manifest**

See [Generate and deploy the manifest](#generate-and-deploy-the-manifest).

:::

::: details Node directly

**Requirements:** Node.js 20.6 or newer, npm, and a TLS certificate for the host.
OpenSSL is only needed if you generate that certificate yourself.

No container needed.

```bash
npm install
cp .env.example .env
make serve
```

`make serve` builds the app and starts `scripts/serve.mjs`. It loads `.env`
automatically when the file exists. The server reads `PORT` (default `3000`),
`HOST`, `DIST_DIR` and the TLS certificate.

The server reads `certs/addin.crt` and `certs/addin-key.pem` by default, the
same files Docker uses. Set `TLS_CERT` and `TLS_KEY` only to override those
paths or to pass PEM content. See [Certificates and HTTPS](#certificates-and-https).

The server listens on `https://localhost:3000` by default. In production, use
the hostname covered by your certificate. To use another port:

```bash
PORT=4000 node scripts/serve.mjs
```

Then generate and deploy the manifest as described below.

:::

::: details Static host

Use this path when you want the simplest hosting and do not need SSO or managed
configuration.

**Requirements:** Node.js 20.6 or newer, npm, and a static host that serves HTTPS.

```bash
npm install
VITE_PROXY_ENABLED=false npm run build
```

Upload `dist/` to Netlify, Vercel, S3, nginx, GitHub Pages or another static
host. There is no `.env` file and no server-side TLS. Each user configures their
provider keys in the add-in settings.

This build has no server-side proxy. OpenCode needs it, so OpenCode will not work
here. The CORS-friendly providers will.

Then generate and deploy the manifest as described below.

:::

## Certificates and HTTPS

The container serves HTTPS directly, so you do not need a separate reverse proxy.
An IP address works for internal testing, but production should use a DNS name.

Use a certificate issued for the exact DNS name users will open. For internal
testing, a self-signed certificate works after you trust it on each client.

::: details Certificates, trust and renewal

**Put the certificate in `certs/`**

The Docker Compose setup expects two fixed names:

```text
certs/
  addin.crt       server certificate first, then intermediates
  addin-key.pem   unencrypted private key
```

With a real certificate, for example Let's Encrypt:

```bash
mkdir -p certs
chmod 700 certs

cp /etc/letsencrypt/live/addin.example.com/fullchain.pem certs/addin.crt
cp /etc/letsencrypt/live/addin.example.com/privkey.pem certs/addin-key.pem

chmod 644 certs/addin.crt
chmod 600 certs/addin-key.pem
```

`addin.crt` must include the server certificate and any intermediate
certificates. `addin-key.pem` must be the matching private key without a
passphrase.

Node reads the same files from the repository root. Docker Compose mounts
`certs/` at `/certs` inside the container. `TLS_CERT` and `TLS_KEY` are optional
overrides for Node; Docker Compose always uses `/certs/addin.crt` and
`/certs/addin-key.pem`.

**Generate a self-signed certificate**

For an internal test, let the setup script generate the files without starting
the container:

```bash
./setup.sh --no-start --host 192.168.1.10
```

Or generate them yourself with OpenSSL. Replace the SAN with your IP or DNS
name:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout certs/addin-key.pem \
  -out certs/addin.crt \
  -subj "/CN=192.168.1.10" \
  -addext "subjectAltName=IP:192.168.1.10,DNS:localhost,IP:127.0.0.1" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign" \
  -addext "extendedKeyUsage=serverAuth"
```

**Trust a self-signed certificate**

Linux system store:

```bash
sudo cp certs/addin.crt /usr/local/share/ca-certificates/opendocbot.crt
sudo update-ca-certificates
```

Chromium, Chrome or Edge on Linux:

```bash
sudo apt install libnss3-tools   # Debian/Ubuntu, if certutil is missing

# Chromium installed as a Snap
certutil -d sql:"$HOME/snap/chromium/current/.pki/nssdb" \
  -A -t "C,," -n "OpenDocBot" -i certs/addin.crt

# Non-Snap Chrome or Chromium
certutil -d sql:"$HOME/.pki/nssdb" \
  -A -t "C,," -n "OpenDocBot" -i certs/addin.crt
```

`update-ca-certificates` is not enough for Chromium or Chrome because they use
their own NSS database. Firefox also has its own store. Import the certificate
there from **Settings > Privacy & Security > Certificates**.

Windows:

1. Double-click `certs/addin.crt`.
2. Choose **Install Certificate**.
3. Select **Local Machine**.
4. Place it in **Trusted Root Certification Authorities**.

macOS:

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain certs/addin.crt
```

If you regenerate the certificate with `--force-cert`, clients must trust the
new certificate before the add-in loads again.

**Renew a certificate**

Replace `certs/addin.crt` and `certs/addin-key.pem`, then restart:

```bash
docker compose restart opendocbot
```

:::

## Generate and deploy the manifest

The repo-root `manifest.xml` points at `https://localhost:3000` and is only for
local development. For a real host, generate a manifest with your URL.

::: details Generate and deploy the manifest

```bash
OPENDOCBOT_URL=https://addin.example.com node scripts/build-manifest.mjs
```

If you use a non-default port, include it:

```bash
OPENDOCBOT_URL=https://addin.example.com:8443 node scripts/build-manifest.mjs
```

This writes `dist/manifest.xml`. The app does not serve this file; it is for
upload to Microsoft 365.

**Deploy centrally (recommended for organizations)**

Upload the manifest to the Microsoft 365 admin center and assign it to users or
groups:
[Manage deployment of add-ins](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-deployment-of-add-ins?view=o365-worldwide).

**Sideload (testing and small deployments)**

- **Office on the web**: upload `manifest.xml` via **Home > Add-ins > More
  Add-ins > My Add-ins > Upload My Add-in**. This is not persistent; the add-in
  can disappear on refresh.
- **Office desktop**: install the manifest as a trusted add-in. On Windows, use a
  [network shared folder catalog](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins);
  on macOS, copy it into each app's `wef` folder
  ([sideload on Mac](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac)).

:::

## Operations

::: details Health check, logs, updates and backups

The server exposes `GET /healthz`. It returns JSON like:

```json
{"status":"ok","tls":true,"managed":false,"sso":false}
```

The endpoint is unauthenticated and does not read from disk. Docker Compose and
the Dockerfile use it for their health checks.

```bash
# Use -k only with a self-signed certificate.
curl -k https://localhost/healthz
```

If you use another port, include it in the URL.

```bash
# Status
docker ps --filter name=opendocbot

# Logs
docker compose logs -f opendocbot

# Restart after changing .env or replacing certificates
docker compose up -d --build

# Stop the container but keep sessions
docker compose down

# Stop and remove the session volume
docker compose down -v
```

Back up `.env`, `certs/` and the session volume if you need to preserve
sessions. Do not commit `.env` or `certs/` to git.

:::

## Environment variables

::: details Environment variables

Most deployments only need to place the certificate files in `certs/`. The only
variables you may want to change are `OPENDOCBOT_HTTPS_PORT` if you use another
port, and `OPENDOCBOT_SESSION_SECRET` if you manage it yourself. The rest are
mainly for SSO, managed configuration and custom builds.

All variables are optional except where noted. Runtime variables are read by
`scripts/serve.mjs` in Docker and Node. Build-time variables are baked into the
bundle and cannot be changed at runtime. Manifest variables are used by
`scripts/build-manifest.mjs`.

| Variable | Default | Scope | Usage |
|---|---|---|---|
| `OPENDOCBOT_HTTPS_PORT` | `443` | Docker Compose | Host port mapped to the container's port 3000. |
| `PORT` | `3000` | Runtime | Server listen port inside the container or Node process. |
| `HOST` | `0.0.0.0` | Runtime | Bind address. |
| `DIST_DIR` | `/app/dist` (Docker), `dist/` (Node) | Runtime | Directory of the built app to serve. |
| `TLS_CERT` | `certs/addin.crt` (Node), `/certs/addin.crt` in Docker | Runtime | Optional override for Node. Docker Compose reads `/certs/addin.crt` from the mounted `certs/` directory. |
| `TLS_KEY` | `certs/addin-key.pem` (Node), `/certs/addin-key.pem` in Docker | Runtime | Optional override for Node. Docker Compose reads `/certs/addin-key.pem` from the mounted `certs/` directory. |
| `OPENDOCBOT_SESSION_STORE` | `/data/opendocbot-sessions.json` (Docker), `~/.opendocbot-sessions.json` (Node) | Runtime | Session store file. Must survive restarts. |
| `OPENDOCBOT_SESSION_SECRET` | auto-generated next to the store | Runtime | Key that encrypts stored refresh tokens. |
| `OPENDOCBOT_MANAGED_CONFIG` | - | Runtime | Inline JSON of forced settings. See [Managed configuration](/docs/enterprise/managed-configuration). |
| `OPENDOCBOT_MANAGED_CONFIG_FILE` | - | Runtime | Path to a JSON file with the forced settings. |
| `OPENDOCBOT_MANAGED_REQUIRE_SSO` | `true` | Runtime | Refuse to start if a managed config is set without OIDC. |
| `OPENDOCBOT_OIDC_ISSUER` | - | Runtime | OIDC issuer URL. Enables SSO when set. See [SSO](/docs/enterprise/sso). |
| `OPENDOCBOT_OIDC_CLIENT_ID` | - | Runtime | OIDC client id. |
| `OPENDOCBOT_OIDC_CLIENT_SECRET` | - | Runtime | OIDC client secret. Optional for a public PKCE client. |
| `OPENDOCBOT_OIDC_SCOPES` | `openid profile email offline_access` | Runtime | Space-separated OIDC scopes. |
| `OPENDOCBOT_OIDC_ALLOWED_GROUPS` | empty (any authenticated user) | Runtime | Comma-separated group object IDs allowed to sign in. |
| `OPENDOCBOT_OIDC_GROUPS_CLAIM` | `groups` | Runtime | ID token claim that carries group membership. |
| `OPENDOCBOT_OIDC_REDIRECT_URI` | `https://<host>/auth/callback` | Runtime | Override the redirect URI. Must match the IdP registration. |
| `VITE_PROXY_ENABLED` | `false` | Build | Bakes the server-side proxy into the bundle. The Docker image always enables it. |
| `VITE_BASE` | `/` | Build | Base path for assets. |
| `VITE_CONFIG_EXPORT_EXCLUDE` | - | Build | Comma-separated setting keys to exclude from configuration exports. |
| `OPENDOCBOT_URL` | derived from `GITHUB_REPOSITORY` | Manifest | Deployment URL written into `dist/manifest.xml`. |
| `OPENDOCBOT_APP_PATH` | - | Manifest | Sub-path appended to the manifest URLs. |
| `OPENDOCBOT_VERSION` | `1.0.0.0` | Manifest | Version written into the manifest. |
| `GITHUB_REPOSITORY` | - | Manifest | Used to derive the GitHub Pages URL when `OPENDOCBOT_URL` is unset. |

:::

## Troubleshooting

::: details Troubleshooting

**Port 443 is already in use**

Check what is listening:

```bash
sudo ss -ltnp | grep ':443'
```

You can change `OPENDOCBOT_HTTPS_PORT`, but Office expects 443 for real users.
If you use another port, include it in `OPENDOCBOT_URL` when generating the
manifest.

**The container is unhealthy**

```bash
docker compose logs --tail=100 opendocbot
```

Check that `certs/addin.crt` and `certs/addin-key.pem` exist, match each other,
and are readable by the container. `setup.sh` validates both before starting.

**`ERR_CERT_AUTHORITY_INVALID` in the browser or Office**

The certificate is self-signed or not trusted on that machine. Trust
`certs/addin.crt`, or use a real certificate issued for the host.

On Linux, `sudo update-ca-certificates` only updates the system store. Chromium,
Chrome and Firefox use different stores. If Chromium is installed as a Snap, the
certificate must be imported into
`$HOME/snap/chromium/current/.pki/nssdb` with `certutil`. See
[Certificates and HTTPS](#certificates-and-https).

**The domain does not resolve**

Create a DNS record for the host that points to the server. For local testing,
use the server IP or add the name to your hosts file. `setup.sh` can verify the
local container with `curl --resolve`, but clients still need DNS.

**`dist/manifest.xml` returns 404**

It is not served by the app. It is a local file generated by `setup.sh` or by
`scripts/build-manifest.mjs`. Upload it to the Microsoft 365 admin center or
sideload it manually.

**Docker permission denied**

Add your user to the `docker` group or run the commands with `sudo`. Log out and
back in after changing group membership.

**`./setup.sh: Permission denied`**

Make it executable:

```bash
chmod +x setup.sh
./setup.sh
```

Or run it with Bash:

```bash
bash setup.sh
```

:::
