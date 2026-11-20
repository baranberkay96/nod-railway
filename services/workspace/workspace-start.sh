#!/bin/sh
# Nod workspace on Railway: hand the volume (/workspace) to `node`, then run the relay as root so it
# can start each command as the user Nod asks for (node, or a connected CLI's own uid).
set -u
[ "$(stat -c %u /workspace)" = 1000 ] || chown 1000:1000 /workspace
chmod 0755 /workspace
export NOD_RELAY_ROLE=workspace
exec node /opt/nod-relay/relay.mjs
