# Deploy and Host Nod with Railway

Nod is n8n's open-source personal AI agent with its own computer: it researches, fills in forms on real websites, works with files and runs code in a Linux workspace, and asks before it acts. This community template runs the Nod server, its workspace and its browser as Railway services, without Docker.

## About Hosting Nod

Upstream self-hosting runs Nod with Docker Compose: the server reaches a workspace container and a browser container through a restricted Docker socket proxy and `docker exec`. Railway services can't run Docker, so this template builds the same images from Nod's pinned source as three services and replaces `docker exec` with a small relay: the server's `docker` command sends each command over the private network to the workspace or browser service, which runs it as the user Nod asks for. The relay allows only the users, folders and commands upstream's own proxy allows, and needs a shared token. Nod's server asks for its access token before anything else.

## Common Use Cases

- A personal assistant that chases invoices, prepares calls and cancels trials on real websites, asking before it acts
- Research that reads web pages, PDFs and spreadsheets and writes the results to files
- Running code and command-line tools in a private Linux workspace instead of on your laptop
- Scheduled tasks and reminders through the web app, Telegram or WhatsApp

## Dependencies for Nod Hosting

- Nod 0.9.0 (source commit `6cebbf1`, built in three services: server, workspace, browser)
- Postgres 17 (Railway's `postgres-ssl` image)
- A model provider key or account (connected in Nod after deploy)

### Deployment Dependencies

- Nod source: https://github.com/n8n-io/nod
- Nod documentation: https://nod.n8n.io
- Upstream self-hosting guide: https://github.com/n8n-io/nod/blob/main/docs/src/content/docs/deploy/self-host.mdx

### Implementation Details

| Service | Source | Purpose |
|---|---|---|
| Nod | `services/server` (upstream self-host Dockerfile + relay `docker` command) | Web app and API on port 4310 (public domain); data on a volume at `/var/lib/nod` |
| workspace | `services/workspace` (upstream Dockerfile.workspace + relay) | Linux workspace where Nod runs commands, Python, LibreOffice, OCR; volume `/workspace`; private |
| browser | `services/browser` (upstream Dockerfile.browser + relay) | Chromium on Xvfb driven by agent-browser; browser profiles on a volume at `/data`; private |
| Postgres | `postgres-ssl:17.11` | Threads, memory, schedules, connections |

**First login.** Open the Nod service's domain and enter `NOD_AUTH_TOKEN` from its Variables tab. One server belongs to one person: the token gives full access to the assistant and every account connected to it, so keep it private. Then finish onboarding to connect a model.

**How the relay works.** The Nod server runs `docker exec` exactly as upstream does; here `docker` is a relay command that reads the workspace and browser addresses and the shared `NOD_RELAY_TOKEN`, and forwards standard input, output and the exit code. When Nod stops a command, the relay ends the connection and the workspace stops the whole process group, as Docker does.

**Differences from upstream's Docker setup.** Upstream puts a firewall container in front of the workspace that blocks private networks; Railway grants no network administration rights, so the workspace here can reach the internet and the project's private network. The workspace leaves out upstream's video downloader (yt-dlp), which Railway's Fair Use Policy does not allow. The workspace keeps `/workspace` on a volume; tools Nod installs into `/home/node` are installed again after a redeploy.

**Safe defaults.** Secrets are generated at deploy. A `NOD_AUTH_TOKEN` shorter than 43 characters (or with other characters than letters, digits, `_` and `-`) locks Nod with a random token and the log says how to fix it; an invalid `NOD_VAULT_KEY` makes Nod keep its key in a file on the volume. Product analytics to n8n are off (`NOD_ANALYTICS_ENABLED=false`).

**Custom domain.** Add it to the Nod service and set `NOD_PUBLIC_URL` to `https://{your-domain}`. Nod answers only for the host in `NOD_PUBLIC_URL`, which is also why the service has no Railway healthcheck (the checker uses its own host name).

**Resources.** Measured idle on Railway: Nod about 0.3 GB, browser about 0.15 GB until a page opens, workspace and Postgres under 0.1 GB each. Browser tasks add Chromium's memory; use the Hobby plan or higher.

**Upgrades.** Change `NOD_COMMIT` in the three Dockerfiles to a newer release commit and redeploy. Nod migrates its database at start.

This is a community template, not affiliated with n8n. Nod is Apache-2.0. Follow Railway's Fair Use Policy and the terms of the sites Nod visits for you.

### Why Deploy Nod on Railway?

Railway runs Nod's server, workspace, browser and database as one private project with an HTTPS domain, so your assistant is reachable from your phone and laptop without a home server, Docker or an SSH tunnel.
