# Nod browser on Railway: upstream's Dockerfile.browser (nod-v0.9.0) built from a pinned commit, as its
# own service. The worker (Chromium on Xvfb, driven by agent-browser) runs as `node` like upstream; a relay
# starts Nod's bridge command in this container instead of `docker exec`.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS source
ARG NOD_COMMIT=6cebbf1a448eba950d97e907bef8435e3a4e8b33
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init -q . && git remote add origin https://github.com/n8n-io/nod.git \
 && for i in 1 2 3 4 5; do git fetch -q --depth 1 origin "$NOD_COMMIT" && break; sleep 10; done \
 && git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "$NOD_COMMIT" && rm -rf .git

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=source /src/package.json /src/pnpm-lock.yaml /src/pnpm-workspace.yaml ./
COPY --from=source /src/patches ./patches
RUN corepack enable && pnpm install --frozen-lockfile && pnpm store prune
COPY --from=source /src/src ./src
RUN node_modules/.bin/esbuild src/providers/container-browser/worker.ts src/providers/container-browser/bridge.ts --bundle --platform=node --format=esm --outdir=/out --out-extension:.js=.mjs \
    && agent="node_modules/agent-browser/bin/agent-browser-linux-$(node -p process.arch)" \
    && install -D -m 555 "$agent" "/out/$agent" \
    && install -D -m 555 src/providers/container-browser/chromium.sh /out/src/providers/container-browser/chromium.sh

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium xvfb xauth xdotool ffmpeg fonts-liberation fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out ./
# Railway's /dev/shm is small; Chromium keeps its shared memory in /tmp instead.
RUN printf '%s\n' '#!/bin/sh' 'exec /usr/bin/chromium --disable-dev-shm-usage "$@" 2>/dev/null' \
      > /app/src/providers/container-browser/chromium.sh
COPY --from=source --chmod=555 /src/src/providers/container-browser/xvfb.sh /usr/local/bin/Xvfb
COPY --from=source /src/LICENSE /src/NOTICE /usr/share/doc/nod/
RUN mkdir /data && chown node:node /data && chmod 700 /data
COPY --chmod=0644 nod-relay.mjs /opt/nod-relay/relay.mjs
COPY --chmod=0755 browser-start.sh /usr/local/bin/browser-start
CMD ["/usr/local/bin/browser-start"]
