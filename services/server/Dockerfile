# Nod server on Railway: upstream's self-host server image (deployment/self-host/Dockerfile at the
# nod-v0.9.0 tag), built from a pinned commit, with one change: the `docker` command is a relay to the
# workspace and browser services instead of the Docker CLI (Railway has no Docker daemon).
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
RUN corepack enable && pnpm install --frozen-lockfile
COPY --from=source /src/tsconfig.json /src/vite.config.ts /src/index.html ./
COPY --from=source /src/src ./src
COPY --from=source /src/public ./public
RUN pnpm exec vite build && pnpm prune --prod && pnpm store prune

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=source --chown=node:node /src/docs/src/content/docs ./docs/src/content/docs
COPY --from=source /src/LICENSE /src/NOTICE /usr/share/doc/nod/
COPY --chmod=0755 docker-relay.mjs /usr/local/bin/docker
COPY --chmod=0755 railway-start.sh /usr/local/bin/railway-start.sh
RUN mkdir -p /var/lib/nod/workspaces && chown -R node:node /var/lib/nod
ENV NODE_ENV=production NOD_ENVIRONMENT=production NOD_DATA_ROOT=/var/lib/nod
EXPOSE 4310
CMD ["/usr/local/bin/railway-start.sh"]
