# Notice

This package is a Railway template for Nod. It is a community template and is not affiliated with or endorsed by n8n GmbH.

## Nod

- Source: https://github.com/n8n-io/nod, tag `nod-v0.9.0`, commit `6cebbf1a448eba950d97e907bef8435e3a4e8b33` (2026-11-19)
- License: Apache-2.0, Copyright 2026 n8n GmbH. Upstream's NOTICE (GPL-3.0-or-later parts of the local phoneme processor, Apache-2.0 schemas) applies and is copied into every image at `/usr/share/doc/nod/`.
- The three Dockerfiles fetch that exact commit and build it the way upstream's files do:
  - `services/server/Dockerfile` follows `deployment/self-host/Dockerfile`; the Docker CLI is replaced by this template's relay command.
  - `services/workspace/Dockerfile` follows `Dockerfile.workspace`, without the `iptables` package, the yt-dlp video downloader and `save-video`; rtk comes from upstream's own `install-rtk.sh prebuilt` path (checksum-verified release build) instead of a Rust compile.
  - `services/browser/Dockerfile` follows `Dockerfile.browser`; the Chromium wrapper adds `--disable-dev-shm-usage`.
- The relay (`services/server/docker-relay.mjs`, `services/*/nod-relay.mjs`) was written for this template. Its allow rules mirror upstream's `deployment/self-host/docker-proxy.mjs` (Apache-2.0).
- Upstream files checked: `compose.yaml`, `deployment/self-host/{compose.yaml,Dockerfile,docker-proxy.mjs,.env.example,setup.sh,healthcheck.mjs}`, `Dockerfile.workspace`, `Dockerfile.browser`, `src/providers/docker/{command,index}.ts`, `src/providers/container-browser/{index,config}.ts`, `src/providers/process.ts`, `src/server/{network,access,app,composition}.ts`, `docs/src/content/docs/deploy/self-host.mdx`.

## Files written for this template (MIT, this repository)

- `services/server/docker-relay.mjs`, `services/server/railway-start.sh`
- `services/workspace/nod-relay.mjs`, `services/workspace/workspace-start.sh`
- `services/browser/nod-relay.mjs`, `services/browser/browser-start.sh`
- the three Dockerfiles (adapted from upstream's, see above), `template.json`, `TEMPLATE.md`, `README.md`

The marketplace templates `nod`, `nod-n8n-labs` (prebuilt images without published source or license) and `nod-community-no-docker` (a fork) were read for ideas; no files or text were copied from them.

## Other images

- `node:24.21.0-bookworm-slim` (digest-pinned, as upstream), Debian packages from Debian's archive.
- Postgres: `ghcr.io/railwayapp-templates/postgres-ssl:17.11` (Railway), PostgreSQL License.
