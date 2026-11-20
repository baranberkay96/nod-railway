#!/bin/sh
# Nod browser on Railway: the worker (as `node`, like upstream) and the relay that starts Nod's bridge
# next to it. If either stops, the container exits and Railway restarts it.
set -u
[ "$(stat -c %u /data)" = 1000 ] || chown 1000:1000 /data
chmod 0700 /data

setpriv --reuid=1000 --regid=1000 --init-groups --inh-caps=-all \
  env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/node LANG=C.UTF-8 node /app/worker.mjs &
worker=$!
NOD_RELAY_ROLE=browser node /opt/nod-relay/relay.mjs &
relay=$!
trap 'kill -TERM "$worker" "$relay" 2>/dev/null' TERM INT
while kill -0 "$worker" 2>/dev/null && kill -0 "$relay" 2>/dev/null; do sleep 2; done
echo "browser: the $(kill -0 "$worker" 2>/dev/null && echo relay || echo worker) stopped; exiting so Railway restarts the service" >&2
kill -TERM "$worker" "$relay" 2>/dev/null
wait
exit 1
