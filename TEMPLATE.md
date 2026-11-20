# Nod Personal AI Agent with Its Own Computer: Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **Nod Personal AI Agent with Its Own Computer** (no version label: upstream is at 0.9.0) |
| Description | n8n's open-source personal agent with a Linux workspace and browser (67 chars) |
| Category | AI/ML |
| Tags | nod, n8n, ai-agent, personal-assistant, browser-automation, computer-use, self-hosted |
| Icon | upstream `public/favicon.svg` at commit 6cebbf1 via jsDelivr (200, image/svg+xml) |
| Repo | `baranberkay96/nod-railway`, service roots `/services/server`, `/services/workspace`, `/services/browser` |

## Feasibility (checked 2026-11-20)

- **License.** Apache-2.0 (n8n GmbH), with a GPL-3.0-or-later phonemizer worker noted in upstream NOTICE. No restriction on hosting.
- **Does the computer need Docker?** Upstream compose runs a Docker socket proxy (`runtime`), a `browser` and a `workspace` container, and a `workspace-network` container with `NET_ADMIN` for iptables. The server never creates containers: it only runs `docker exec -i --user U [--workdir W] CONTAINER CMD` in the two long-running containers (`src/providers/docker/command.ts`, `src/providers/container-browser/index.ts`), and upstream's proxy allows nothing else. So the workspace and the browser can be ordinary services if something else carries those exec calls: no nested containers (STANDARD 8.32 not triggered).
- **Relay.** `services/server/docker-relay.mjs` is installed as `/usr/local/bin/docker` in the server image. Nod passes only `PATH`, `TMPDIR`, `LANG` and `DOCKER_*` to it, so the relay reads its addresses and token from `$DOCKER_CONFIG/nod-relay.json` (mode 600, written by the start script). It frames stdin, stdout, stderr and the exit code over TCP to `nod-relay.mjs` (root) in the workspace or browser service, which applies upstream's proxy rules (browser: only `node /app/bridge.mjs` as `node`; workspace: `node` in `/var/tmp` or `/workspace/<uuid>`, or a connected CLI uid `2xxxx:1002` in `/var/tmp`), starts the command as that uid in its own process group, and kills the group when the caller disconnects. Tested locally: stdin/stdout round trip, exit codes, 5 MB output, refused users, unreachable service, kill propagation.
- **Lost from upstream:** the workspace firewall (needs `NET_ADMIN`) and the yt-dlp video downloader (Railway Fair Use: YouTube downloading). `/home/node` in the workspace is not persistent (only one volume per service; `/workspace` is kept).
- **Shared volume?** Upstream mounts the workspaces volume in both server and workspace, but the server only `mkdir`s there; artifacts go through `writeArtifact`/`readArtifact`, which use the exec channel. Separate volumes work.
- **Healthcheck.** Nod answers 403 to any Host other than `NOD_PUBLIC_URL`'s and 401 to `/api/*` without the token, so Railway's checker (own Host header) can't be used; the server has no healthcheck path.

## Market templates

- `nod-n8n-labs` (1 active), `nod` (0 active): prebuilt `ghcr.io/hmseeb/nod-railway-*:0.9.0` images with relays on port 7070; no published source or license for the images.
- `nod-community-no-docker` (2 active): builds a fork (`samiabid/nod`) at an older revision with a `NOD_RUNTIME=remote` patch to the server.

Improvements here: built from upstream's own pinned commit (fetched by SHA), unmodified server code (the relay replaces only the Docker CLI), upstream's exec allow-rules enforced in the relay, odd deploy-form values handled, volumes for all three data locations, Postgres 17 as upstream.

## Pinned versions

| Component | Reference | Checked |
|---|---|---|
| Nod | `n8n-io/nod` commit `6cebbf1a448eba950d97e907bef8435e3a4e8b33` (tag nod-v0.9.0, 2026-11-19) | 2026-11-20 |
| Node.js base | `node:24.21.0-bookworm-slim@sha256:d6aa754f…7b20` (as upstream) | 2026-11-20 |
| rtk | 0.51.0 release build, SHA-256 in upstream's `install-rtk.sh` | 2026-11-20 |
| Postgres | `ghcr.io/railwayapp-templates/postgres-ssl:17.11@sha256:5e806d28…463e` | 2026-11-20 |

## Services and variables

| Service | Source | Health | Domain | Volume |
|---|---|---|---|---|
| Nod | repo `/services/server` | – (see above) | public, 4310 | `/var/lib/nod` |
| workspace | repo `/services/workspace` | – (TCP relay only) | private, 7070 | `/workspace` |
| browser | repo `/services/browser` | – (TCP relay only) | private, 7070 | `/data` |
| Postgres | `postgres-ssl:17.11` | – | private | `/var/lib/postgresql/data` |

Nod: `PORT=4310`, `NOD_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`, `NOD_AUTH_TOKEN` (`secret(48, base64url)`), `NOD_VAULT_KEY` (`secret(42, base64)` + one of `AEIMQUYcgkosw048` + `=` = 32 bytes), `DATABASE_URL`, `NOD_RELAY_TOKEN` (`secret(48)`), `NOD_WORKSPACE_RELAY`/`NOD_BROWSER_RELAY` (`${{svc.RAILWAY_PRIVATE_DOMAIN}}:7070`), `NOD_ANALYTICS_ENABLED=false`. Start script sets `NOD_HOST=::`, `WORKSPACE_CONTAINER=nod-workspace`, `BROWSER_CONTAINER=nod-browser`, `DOCKER_CONFIG=/run/nod-relay`, drops to `node`.
workspace/browser: `NOD_RELAY_TOKEN` (reference), `NOD_RELAY_PORT=7070`.

Fallbacks (STANDARD 8.29): invalid `NOD_AUTH_TOKEN` → locked with a random token; invalid `NOD_VAULT_KEY` → key file on the volume; non-https `NOD_PUBLIC_URL` → `https://$RAILWAY_PUBLIC_DOMAIN`; invalid `PORT` → 4310; relay token under 32 chars → relays refuse every command (logged).

## Resource profile (measured on Railway, 2026-11-20)

Filled from the pre-publish deploy (see report).

## Test results (Railway, pre-publish, 2026-11-20)

See `_reports/round12/163-nod.md`.

## Verification checklist

1. Four services SUCCESS; the Nod domain shows the access form; `/api/health` without the token is 401.
2. Enter `NOD_AUTH_TOKEN`; onboarding opens; connect a model.
3. Ask Nod to run `python3 -c "print(1+1)"` (workspace) and to open a web page and describe it (browser).
4. Redeploy Nod and the workspace: threads and files in `/workspace` remain.

## Open questions

- Workspace commands can reach the project's private network (no firewall container). Postgres is protected by its password; nothing else in the project listens unauthenticated except the relays, which need the token.
- Real agent tasks need a model key, which tests did not use.
