#!/usr/bin/env bash
# Guided self-hosting setup for OpenDocBot.
#
# Interactive:
#   ./setup.sh
#
# Non-interactive:
#   ./setup.sh --yes --host 192.168.1.10
#   ./setup.sh addin.example.com --cert fullchain.pem --key privkey.pem
#
# Options:
#   --host ADDR       Hostname or IP to use in the certificate and manifest
#   --port N          HTTPS port (default 443)
#   --cert FILE       Existing PEM certificate chain
#   --key FILE        Existing PEM private key
#   --force-cert      Regenerate the self-signed certificate
#   --yes, -y         Use defaults and do not prompt
#   --no-start        Generate certificates, .env and manifest, but do not start
#   -h, --help        Show this help
#
# Requirements: Docker with Compose v2, OpenSSL and curl. Node is only needed
# to generate dist/manifest.xml.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENV_FILE=".env"
CERT_DIR="certs"
CERT_FILE="${CERT_DIR}/addin.crt"
KEY_FILE="${CERT_DIR}/addin-key.pem"

TARGET=""
HOST_OVERRIDE=""
PORT="${OPENDOCBOT_HTTPS_PORT:-443}"
PORT_SET=0
CERT_SOURCE=""
KEY_SOURCE=""
FORCE_CERT=0
ASSUME_YES=0
NO_START=0

COLOR=1
if [[ ! -t 1 || -n "${NO_COLOR:-}" || "${TERM:-}" == "dumb" ]]; then
  COLOR=0
fi
if [[ "$COLOR" -eq 1 ]]; then
  if [[ "${COLORTERM:-}" == *truecolor* || "${COLORTERM:-}" == *24bit* ]]; then
    BRAND=$'\033[38;2;22;202;97m'
  else
    BRAND=$'\033[38;5;42m'
  fi
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[38;5;42m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
  trap 'printf "\033[0m"' EXIT
else
  BRAND=""
  BOLD=""
  DIM=""
  GREEN=""
  YELLOW=""
  RED=""
  RESET=""
fi

die() { printf '  %s✗%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }
info() { printf '  %s·%s %s\n' "$DIM" "$RESET" "$1"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1" >&2; }

banner() {
  printf '\n'
  printf '  %s>%s %sOpenDocBot%s\n' "$BRAND" "$RESET" "$BOLD" "$RESET"
  printf '    %sself-hosting setup%s\n' "$DIM" "$RESET"
  printf '    %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
}

step() {
  printf '\n  %s%s%s  %s%s%s\n' "$BRAND" "$1" "$RESET" "$BOLD" "$2" "$RESET"
  printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
}

finish() {
  printf '\n  %s>%s %sSetup complete.%s\n\n' "$BRAND" "$RESET" "$BOLD" "$RESET"
}

summary_item() {
  printf '  %s%-12s%s %s\n' "$DIM" "$1" "$RESET" "$2"
}

next_no_start() {
  finish
  printf '  %sNext%s\n' "$BOLD" "$RESET"
  printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
  info "start with: docker compose up -d --build"
  print_trust_instructions
  info "upload dist/manifest.xml to the Microsoft 365 admin center after starting"
}

usage() {
  banner
  cat <<'EOF'
Guided self-hosting setup for OpenDocBot.

Interactive:
  ./setup.sh

Non-interactive:
  ./setup.sh --yes --host 192.168.1.10
  ./setup.sh addin.example.com --cert fullchain.pem --key privkey.pem

Options:
  --host ADDR       Hostname or IP to use in the certificate and manifest
  --port N          HTTPS port (default 443)
  --cert FILE       Existing PEM certificate chain
  --key FILE        Existing PEM private key
  --force-cert      Regenerate the self-signed certificate
  --yes, -y         Use defaults and do not prompt
  --no-start        Generate certificates, .env and manifest, but do not start
  -h, --help        Show this help
EOF
}

ask() {
  local prompt="$1" default="${2:-}" answer
  if [[ -n "$default" ]]; then
    printf '  %s?%s %s %s[%s]%s: ' "$BRAND" "$RESET" "$prompt" "$DIM" "$default" "$RESET" >&2
  else
    printf '  %s?%s %s: ' "$BRAND" "$RESET" "$prompt" >&2
  fi
  read -r answer || true
  printf '%s' "${answer:-$default}"
}

ask_secret() {
  local prompt="$1" answer
  printf '  %s?%s %s: ' "$BRAND" "$RESET" "$prompt" >&2
  read -r -s answer || true
  printf '\n' >&2
  printf '%s' "$answer"
}

ask_yes_no() {
  local prompt="$1" default="${2:-n}" answer suffix
  suffix='[y/N]'
  [[ "$default" == "y" ]] && suffix='[Y/n]'
  printf '  %s?%s %s %s%s%s ' "$BRAND" "$RESET" "$prompt" "$DIM" "$suffix" "$RESET" >&2
  read -r answer || true
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]]
}

is_ip() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }

detect_host() {
  local ip=""
  case "$(uname -s)" in
    Darwin)
      for iface in en0 en1; do
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
        [[ -n "$ip" ]] && { printf '%s' "$ip"; return 0; }
      done
      ;;
    *)
      ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") { print $(i+1); exit }}' || true)
      [[ -n "$ip" ]] && { printf '%s' "$ip"; return 0; }
      ip=$(hostname -I 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) { print $i; exit }}' || true)
      [[ -n "$ip" ]] && { printf '%s' "$ip"; return 0; }
      ;;
  esac
  return 1
}

read_env() {
  local key="$1" line
  [[ -f "$ENV_FILE" ]] || return 1
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)
  [[ -n "$line" ]] || return 1
  line="${line#*=}"
  line="${line#\"}"
  line="${line%\"}"
  printf '%s' "$line"
}

escape_env() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

set_env_var() {
  local key="$1" value="$2" tmp
  tmp=$(mktemp "${ENV_FILE}.tmp.XXXXXX")
  if [[ -f "$ENV_FILE" ]]; then
    awk -v k="$key" 'BEGIN { FS="=" } $1 != k { print }' "$ENV_FILE" > "$tmp"
  fi
  printf '%s="%s"\n' "$key" "$(escape_env "$value")" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}

remove_env_var() {
  local key="$1" tmp
  [[ -f "$ENV_FILE" ]] || return 0
  tmp=$(mktemp "${ENV_FILE}.tmp.XXXXXX")
  awk -v k="$key" 'BEGIN { FS="=" } $1 != k { print }' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

backup_env() {
  local backup
  [[ -f "$ENV_FILE" ]] || return 0
  backup="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp -p "$ENV_FILE" "$backup"
  info "backed up .env to ${backup}"
}

cert_host_status() {
  local cert="$1" out
  if [[ "$IS_IP" -eq 1 ]]; then
    out=$(openssl x509 -in "$cert" -noout -checkip "$HOST" 2>/dev/null || true)
  else
    out=$(openssl x509 -in "$cert" -noout -checkhost "$HOST" 2>/dev/null || true)
  fi
  if [[ -z "$out" ]]; then
    printf 'unknown'
  elif [[ "$out" == *"does match"* ]]; then
    printf 'match'
  else
    printf 'mismatch'
  fi
}

cert_is_self_signed() {
  local subject issuer
  subject=$(openssl x509 -in "$CERT_FILE" -noout -subject 2>/dev/null || true)
  issuer=$(openssl x509 -in "$CERT_FILE" -noout -issuer 2>/dev/null || true)
  subject="${subject#subject=}"
  issuer="${issuer#issuer=}"
  [[ "$subject" == "$issuer" ]]
}

install_cert() {
  local cert="$1" key="$2" cert_pub key_pub status
  [[ -r "$cert" ]] || die "cannot read ${cert}"
  [[ -r "$key" ]] || die "cannot read ${key}"
  cert_pub=$(openssl x509 -in "$cert" -noout -pubkey 2>/dev/null) || die "${cert} is not a PEM certificate"
  key_pub=$(openssl pkey -in "$key" -pubout -passin pass: 2>/dev/null) || die "${key} is not an unencrypted PEM private key"
  [[ "$cert_pub" == "$key_pub" ]] || die "the certificate and the private key do not match"
  status=$(cert_host_status "$cert")
  if [[ "$status" == "mismatch" ]]; then
    die "the certificate does not cover ${HOST}"
  elif [[ "$status" == "unknown" ]]; then
    warn "could not verify that the certificate covers ${HOST}"
  fi
  [[ "$cert" -ef "$CERT_FILE" ]] || install -m 644 "$cert" "$CERT_FILE"
  [[ "$key" -ef "$KEY_FILE" ]] || install -m 600 "$key" "$KEY_FILE"
  ok "installed certificate from ${cert}"
}

generate_cert() {
  local san target
  if [[ "$IS_IP" -eq 1 ]]; then
    target="IP:${HOST}"
  else
    target="DNS:${HOST}"
  fi
  san="DNS:localhost,DNS:$(hostname 2>/dev/null || echo opendocbot),IP:127.0.0.1"
  [[ ",${san}," == *",${target},"* ]] || san="${san},${target}"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$KEY_FILE" -out "$CERT_FILE" \
    -subj "/CN=${HOST}" \
    -addext "subjectAltName=${san}" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign" \
    -addext "extendedKeyUsage=serverAuth" \
    >/dev/null 2>&1 || die "openssl could not create the certificate"
  chmod 600 "$KEY_FILE"
  chmod 644 "$CERT_FILE"
  SELF_SIGNED=1
  ok "generated a self-signed certificate for ${HOST}"
}

print_trust_instructions() {
  [[ "$SELF_SIGNED" -eq 1 ]] || return 0
  printf '\n  %sCertificate trust%s\n' "$BOLD" "$RESET"
  printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
  printf '  %sSelf-signed certificate. Trust it on every client that opens the add-in,%s\n' "$DIM" "$RESET"
  printf '  %sor rerun with --cert/--key using a certificate clients already trust.%s\n' "$DIM" "$RESET"

  printf '\n  %sLinux system store%s\n' "$BOLD" "$RESET"
  printf '    sudo cp %s /usr/local/share/ca-certificates/opendocbot.crt\n' "$CERT_FILE"
  printf '    sudo update-ca-certificates\n'

  printf '\n  %sChromium, Chrome or Edge on Linux%s\n' "$BOLD" "$RESET"
  printf '    sudo apt install libnss3-tools   # Debian/Ubuntu, if certutil is missing\n'
  printf '    certutil -d sql:"$HOME/snap/chromium/current/.pki/nssdb" \\\n'
  printf '      -A -t "C,," -n "OpenDocBot" -i %s\n' "$CERT_FILE"
  printf '    certutil -d sql:"$HOME/.pki/nssdb" \\\n'
  printf '      -A -t "C,," -n "OpenDocBot" -i %s\n' "$CERT_FILE"
  printf '  %sUse the Snap path for Chromium Snap and the second path for non-Snap Chrome.%s\n' "$DIM" "$RESET"
  printf '  %sFirefox has its own store: Settings > Privacy & Security > Certificates.%s\n' "$DIM" "$RESET"

  printf '\n  %sWindows%s\n' "$BOLD" "$RESET"
  printf '    Double-click %s\n' "$CERT_FILE"
  printf '    Install Certificate > Local Machine > Trusted Root Certification Authorities\n'

  printf '\n  %smacOS%s\n' "$BOLD" "$RESET"
  printf '    sudo security add-trusted-cert -d -r trustRoot \\\n'
  printf '      -k /Library/Keychains/System.keychain %s\n' "$CERT_FILE"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) [[ $# -ge 2 ]] || die "--host needs a value"; HOST_OVERRIDE="$2"; shift 2 ;;
    --port) [[ $# -ge 2 ]] || die "--port needs a value"; PORT="$2"; PORT_SET=1; shift 2 ;;
    --cert) [[ $# -ge 2 ]] || die "--cert needs a value"; CERT_SOURCE="$2"; shift 2 ;;
    --key) [[ $# -ge 2 ]] || die "--key needs a value"; KEY_SOURCE="$2"; shift 2 ;;
    --force-cert) FORCE_CERT=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --no-start) NO_START=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option: $1 (see ./setup.sh --help)" ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [[ -n "$CERT_SOURCE" || -n "$KEY_SOURCE" ]]; then
  [[ -n "$CERT_SOURCE" && -n "$KEY_SOURCE" ]] || die "--cert and --key go together"
fi
if [[ "$FORCE_CERT" -eq 1 && ( -n "$CERT_SOURCE" || -n "$KEY_SOURCE" ) ]]; then
  die "--force-cert cannot be combined with --cert/--key"
fi

banner

command -v docker >/dev/null 2>&1 || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is not installed"
command -v openssl >/dev/null 2>&1 || die "openssl is not installed"
command -v curl >/dev/null 2>&1 || die "curl is not installed"
[[ -f docker-compose.yml ]] || die "docker-compose.yml not found; run this script from the repository root"

NODE_AVAILABLE=0
command -v node >/dev/null 2>&1 && NODE_AVAILABLE=1

printf '\n  %sThis wizard will create a TLS certificate, write .env,%s\n' "$DIM" "$RESET"
printf '  %sgenerate dist/manifest.xml and prepare the Docker deployment.%s\n' "$DIM" "$RESET"
printf '  %sPress Ctrl+C to cancel.%s\n' "$DIM" "$RESET"

step "1/5" "Address and certificate"

HOST_EXPLICIT=0
HOST_DETECTED=0
if [[ -n "$HOST_OVERRIDE$TARGET" ]]; then
  HOST_EXPLICIT=1
  HOST="${HOST_OVERRIDE:-$TARGET}"
else
  HOST=$(detect_host || true)
  HOST_DETECTED=1
fi
HOST="${HOST#https://}"
HOST="${HOST#http://}"
HOST="${HOST%%/*}"

if [[ -z "$HOST" ]]; then
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    die "could not detect a host; pass one with --host"
  fi
  info "No address was detected automatically."
  HOST=$(ask "Hostname or IP address" "")
  HOST_DETECTED=0
fi

if [[ "$HOST_EXPLICIT" -eq 1 ]]; then
  info "Using address: ${HOST}"
elif [[ "$HOST_DETECTED" -eq 1 && "$ASSUME_YES" -eq 0 ]]; then
  info "Detected address: ${HOST}"
  if ! ask_yes_no "Use this address?" y; then
    HOST=$(ask "Hostname or IP address" "$HOST")
    info "Using address: ${HOST}"
  fi
elif [[ "$HOST_DETECTED" -eq 1 ]]; then
  info "Detected address: ${HOST}"
else
  info "Using address: ${HOST}"
fi

[[ -n "$HOST" ]] || die "host cannot be empty"
[[ "$HOST" != *"/"* ]] || die "host must not contain a path"
[[ "$HOST" != *":"* ]] || die "host must not include a port; use --port"

IS_IP=0
is_ip "$HOST" && IS_IP=1

printf '\n  %sOffice add-ins normally use port 443.%s\n' "$DIM" "$RESET"
if [[ "$PORT_SET" -eq 0 && "$ASSUME_YES" -eq 0 ]]; then
  PORT=$(ask "HTTPS port" "$PORT")
fi
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( 10#$PORT < 1 || 10#$PORT > 65535 )); then
  die "invalid port: ${PORT}"
fi
PORT=$((10#$PORT))
PORT_SUFFIX=""
[[ "$PORT" != "443" ]] && PORT_SUFFIX=":${PORT}"
BASE_URL="https://${HOST}${PORT_SUFFIX}"
if [[ "$PORT" != "443" ]]; then
  warn "Office expects the add-in on port 443; use 443 for real users"
fi
info "Add-in URL: ${BASE_URL}"

printf '\n  %sCertificate%s\n' "$BOLD" "$RESET"
printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"

mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"
SELF_SIGNED=0
CERT_READY=0

if [[ -n "$CERT_SOURCE" ]]; then
  install_cert "$CERT_SOURCE" "$KEY_SOURCE"
  CERT_READY=1
elif [[ -f "$CERT_FILE" && -f "$KEY_FILE" && "$FORCE_CERT" -eq 0 ]]; then
  if [[ "$ASSUME_YES" -eq 1 ]] || ask_yes_no "Reuse the existing certificate in ${CERT_DIR}?" y; then
    info "reusing ${CERT_FILE}"
    CERT_READY=1
  fi
fi

if [[ "$CERT_READY" -eq 1 && -z "$CERT_SOURCE" ]]; then
  STATUS=$(cert_host_status "$CERT_FILE")
  if [[ "$STATUS" == "mismatch" ]]; then
    if [[ "$ASSUME_YES" -eq 1 ]]; then
      die "the certificate does not cover ${HOST}; pass --cert/--key or --force-cert"
    fi
    if ! ask_yes_no "The certificate does not cover ${HOST}. Use it anyway?" n; then
      CERT_READY=0
    fi
  elif [[ "$STATUS" == "unknown" ]]; then
    warn "could not verify that the certificate covers ${HOST}"
  fi
fi

if [[ "$CERT_READY" -eq 0 ]]; then
  if [[ "$ASSUME_YES" -eq 1 || "$FORCE_CERT" -eq 1 ]]; then
    generate_cert
  elif ask_yes_no "Generate a self-signed certificate for ${HOST}?" y; then
    generate_cert
  else
    CERT_SOURCE=$(ask "Path to certificate PEM" "")
    KEY_SOURCE=$(ask "Path to private key PEM" "")
    [[ -n "$CERT_SOURCE" && -n "$KEY_SOURCE" ]] || die "certificate and key are required"
    install_cert "$CERT_SOURCE" "$KEY_SOURCE"
  fi
fi

if cert_is_self_signed; then
  SELF_SIGNED=1
else
  SELF_SIGNED=0
fi

step "2/5" "Configuration"
if [[ -f "$ENV_FILE" ]]; then
  backup_env
  if [[ "$ASSUME_YES" -eq 0 ]]; then
    info "existing keys:"
    grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | cut -d= -f1 | sed 's/^/    /' || true
    if ! ask_yes_no "Keep the existing .env values and update deployment settings?" y; then
      rm "$ENV_FILE"
    fi
  fi
fi
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# OpenDocBot self-hosted configuration
# Generated by setup.sh. See docs/docs/selfhosting.md.
EOF
fi

set_env_var OPENDOCBOT_HTTPS_PORT "$PORT"

# Older versions wrote container paths into .env. They break `make serve`
# because Node runs on the host, so remove only those legacy defaults.
LEGACY_CERT=$(read_env TLS_CERT || true)
LEGACY_KEY=$(read_env TLS_KEY || true)
if [[ "$LEGACY_CERT" == "/certs/addin.crt" ]]; then
  remove_env_var TLS_CERT
  info "removed legacy TLS_CERT path from .env"
fi
if [[ "$LEGACY_KEY" == "/certs/addin-key.pem" ]]; then
  remove_env_var TLS_KEY
  info "removed legacy TLS_KEY path from .env"
fi

SESSION_SECRET=$(read_env OPENDOCBOT_SESSION_SECRET || true)
if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET=$(openssl rand -base64 32)
  ok "generated OPENDOCBOT_SESSION_SECRET"
else
  info "keeping existing OPENDOCBOT_SESSION_SECRET"
fi
set_env_var OPENDOCBOT_SESSION_SECRET "$SESSION_SECRET"

if [[ "$ASSUME_YES" -eq 0 ]] && ask_yes_no "Configure SSO now?" n; then
  OIDC_ISSUER=$(ask "OIDC issuer URL" "$(read_env OPENDOCBOT_OIDC_ISSUER || true)")
  OIDC_CLIENT_ID=$(ask "OIDC client ID" "$(read_env OPENDOCBOT_OIDC_CLIENT_ID || true)")
  OIDC_EXISTING_SECRET=$(read_env OPENDOCBOT_OIDC_CLIENT_SECRET || true)
  if [[ -n "$OIDC_EXISTING_SECRET" ]]; then
    OIDC_CLIENT_SECRET=$(ask_secret "OIDC client secret (leave empty to keep the existing one)")
  else
    OIDC_CLIENT_SECRET=$(ask_secret "OIDC client secret")
  fi
  [[ -n "$OIDC_CLIENT_SECRET" ]] || OIDC_CLIENT_SECRET="$OIDC_EXISTING_SECRET"
  OIDC_GROUPS=$(ask "Allowed groups, comma-separated (optional)" "$(read_env OPENDOCBOT_OIDC_ALLOWED_GROUPS || true)")
  OIDC_CLAIM=$(ask "Groups claim" "$(read_env OPENDOCBOT_OIDC_GROUPS_CLAIM || true)")
  [[ -n "$OIDC_CLAIM" ]] || OIDC_CLAIM="groups"

  if [[ -z "$OIDC_ISSUER" || -z "$OIDC_CLIENT_ID" ]]; then
    warn "SSO skipped: issuer and client ID are required"
  else
    set_env_var OPENDOCBOT_OIDC_ISSUER "$OIDC_ISSUER"
    set_env_var OPENDOCBOT_OIDC_CLIENT_ID "$OIDC_CLIENT_ID"
    set_env_var OPENDOCBOT_OIDC_CLIENT_SECRET "$OIDC_CLIENT_SECRET"
    set_env_var OPENDOCBOT_OIDC_ALLOWED_GROUPS "$OIDC_GROUPS"
    set_env_var OPENDOCBOT_OIDC_GROUPS_CLAIM "$OIDC_CLAIM"
    ok "SSO configured"
  fi
fi

if ! grep -q '^OPENDOCBOT_OIDC_ISSUER=' "$ENV_FILE"; then
  cat >> "$ENV_FILE" <<'EOF'

# SSO (optional). See https://opendocbot.com/docs/enterprise/sso
# OPENDOCBOT_OIDC_ISSUER=
# OPENDOCBOT_OIDC_CLIENT_ID=
# OPENDOCBOT_OIDC_CLIENT_SECRET=
# OPENDOCBOT_OIDC_ALLOWED_GROUPS=
# OPENDOCBOT_OIDC_GROUPS_CLAIM=groups
EOF
fi
chmod 600 "$ENV_FILE"
ok ".env written (mode 0600)"

step "3/5" "Manifest"
mkdir -p dist
if [[ "$NODE_AVAILABLE" -eq 1 ]]; then
  OPENDOCBOT_URL="$BASE_URL" node scripts/build-manifest.mjs
  ok "manifest written to dist/manifest.xml"
else
  warn "Node not found; manifest was not generated"
  info "run: OPENDOCBOT_URL=${BASE_URL} node scripts/build-manifest.mjs"
fi

step "4/5" "Deployment summary"
summary_item "URL" "$BASE_URL"
summary_item "Host" "$HOST"
summary_item "Port" "$PORT"
summary_item "Certificate" "$CERT_FILE"
summary_item "Env" "$ENV_FILE"
summary_item "Manifest" "dist/manifest.xml (local file)"

if [[ "$NO_START" -eq 1 ]]; then
  next_no_start
  exit 0
fi
if [[ "$ASSUME_YES" -eq 0 ]] && ! ask_yes_no "Start the container now?" y; then
  next_no_start
  exit 0
fi

step "5/5" "Starting"
docker compose -f docker-compose.yml up -d --build
for ((i=1; i<=60; i++)); do
  STATUS=$(docker inspect -f '{{.State.Health.Status}}' opendocbot 2>/dev/null || echo starting)
  if [[ "$STATUS" == "healthy" ]]; then
    ok "container is healthy"
    break
  fi
  if [[ "$STATUS" == "unhealthy" ]]; then
    docker compose -f docker-compose.yml logs --tail=100 opendocbot || true
    die "container is unhealthy"
  fi
  if [[ "$i" -eq 60 ]]; then
    docker compose -f docker-compose.yml logs --tail=100 opendocbot || true
    die "container did not become healthy within 120s"
  fi
  sleep 2
done

CURL=(curl -sS --max-time 5 -o /dev/null -w '%{http_code}')
if [[ "$IS_IP" -eq 0 ]]; then
  CURL+=(--resolve "${HOST}:${PORT}:127.0.0.1")
fi
VERIFIED=0
for ((i=1; i<=45; i++)); do
  if [[ "$SELF_SIGNED" -eq 1 ]]; then
    CODE=$("${CURL[@]}" --cacert "$CERT_FILE" "${BASE_URL}/" 2>/dev/null || true)
  else
    CODE=$("${CURL[@]}" "${BASE_URL}/" 2>/dev/null || true)
  fi
  if [[ "$CODE" == "200" ]]; then
    if [[ "$SELF_SIGNED" -eq 1 ]]; then
      ok "verified ${BASE_URL}/ against ${CERT_FILE}"
    else
      ok "verified ${BASE_URL}/ with the system trust store"
    fi
    VERIFIED=1
    break
  fi
  if [[ "$("${CURL[@]}" -k "${BASE_URL}/" 2>/dev/null || true)" == "200" ]]; then
    ok "verified ${BASE_URL}/ (this machine cannot validate the chain)"
    VERIFIED=1
    break
  fi
  sleep 2
done
[[ "$VERIFIED" -eq 1 ]] || die "no answer on ${BASE_URL} (docker compose logs --tail=100 opendocbot)"

printf '\n  %sRunning%s\n' "$BOLD" "$RESET"
printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
summary_item "App" "$BASE_URL"
summary_item "Manifest" "dist/manifest.xml (local file)"
summary_item "Cert" "$CERT_FILE"
summary_item "Key" "$KEY_FILE"
summary_item "Status" "docker ps --filter name=opendocbot"
summary_item "Logs" "docker logs -f opendocbot"
summary_item "Stop" "docker compose down"

print_trust_instructions

printf '\n  %sNext%s\n' "$BOLD" "$RESET"
printf '  %s────────────────────────────────────────%s\n' "$DIM" "$RESET"
info "upload dist/manifest.xml to the Microsoft 365 admin center"
info "Settings > Integrated apps, then assign it to users or groups"
printf '\n  %sYou should be comfortable operating Docker containers.%s\n' "$DIM" "$RESET"
info "docker ps --filter name=opendocbot"
info "docker logs -f opendocbot"
info "docker compose down"
