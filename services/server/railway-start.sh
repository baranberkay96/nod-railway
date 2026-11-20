#!/bin/sh
# Start the Nod server on Railway: prepare the volume, check the deploy-form values (an odd value
# falls back to a safe default and never stops the deploy), write the relay settings, drop to `node`.
set -u
log() { echo "railway-start: $*" >&2; }
random_token() { node -e 'process.stdout.write(require("crypto").randomBytes(36).toString("base64url"))'; }

data=/var/lib/nod
mkdir -p "$data/workspaces"
[ "$(stat -c %u "$data")" = 1000 ] || chown -R 1000:1000 "$data"

case "${PORT:-}" in
  '' | *[!0-9]*) log "PORT '${PORT:-}' is not a number; using 4310"; export PORT=4310 ;;
esac
export NOD_HOST="${NOD_HOST:-::}"

# The public origin: Nod accepts requests only for this host, and only HTTPS outside localhost.
url=${NOD_PUBLIC_URL:-}
url=${url%/}
case "$url" in
  https://?*) ;;
  *)
    if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
      log "NOD_PUBLIC_URL '${url}' is not an https:// origin; using https://${RAILWAY_PUBLIC_DOMAIN}"
      url="https://${RAILWAY_PUBLIC_DOMAIN}"
    else
      log "NOD_PUBLIC_URL is not set and the service has no public domain; Nod answers on localhost only"
      url="http://localhost:${PORT}"
    fi
    ;;
esac
export NOD_PUBLIC_URL="$url"

# The access token people enter. Nod refuses one under 43 characters; a bad value locks the server with
# a random token nobody knows instead of failing the deploy.
if ! printf '%s' "${NOD_AUTH_TOKEN:-}" | grep -Eq '^[A-Za-z0-9_-]{43,}$'; then
  log "NOD_AUTH_TOKEN must be 43 or more letters, digits, _ or -. Nod is locked with a random token until you set"
  log "a valid one on this service and redeploy."
  NOD_AUTH_TOKEN=$(random_token)
fi
export NOD_AUTH_TOKEN

# The key that encrypts saved model keys: 32 bytes in base64. Without a valid one Nod keeps its key in
# a file on this volume instead (upstream's Linux default).
if [ -n "${NOD_VAULT_KEY:-}" ] && ! node -e 'process.exit(Buffer.from(process.argv[1], "base64").length === 32 ? 0 : 1)' "$NOD_VAULT_KEY"; then
  log "NOD_VAULT_KEY is not 32 bytes in base64; using a key file on the volume instead."
  unset NOD_VAULT_KEY
fi

# Where the `docker` relay finds the workspace and browser services. Only the relay reads this file.
relay=/run/nod-relay
mkdir -p "$relay"
token=${NOD_RELAY_TOKEN:-}
if [ "${#token}" -lt 32 ]; then
  log "NOD_RELAY_TOKEN is missing or shorter than 32 characters: the workspace and browser refuse every command."
fi
node -e '
  const [token, workspace, browser] = process.argv.slice(1);
  require("fs").writeFileSync("/run/nod-relay/nod-relay.json", JSON.stringify({ token, workspace, browser }), { mode: 0o600 });
' "$token" "${NOD_WORKSPACE_RELAY:-}" "${NOD_BROWSER_RELAY:-}"
chown -R 1000:1000 "$relay"
chmod 0700 "$relay"
export DOCKER_CONFIG="$relay"
export WORKSPACE_CONTAINER=nod-workspace BROWSER_CONTAINER=nod-browser
unset NOD_RELAY_TOKEN

cd /app
exec setpriv --reuid=1000 --regid=1000 --init-groups --inh-caps=-all \
  env HOME=/home/node node --import tsx src/server/index.ts
