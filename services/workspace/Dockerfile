# Nod workspace on Railway: upstream's Dockerfile.workspace (nod-v0.9.0) built from a pinned commit, as
# its own service. Differences: a relay runs the commands Nod's server sends (instead of `docker exec`);
# no iptables firewall container (Railway allows no NET_ADMIN); no yt-dlp video downloader (Railway's
# Fair Use Policy); rtk from its checksum-verified release build instead of a Rust compile.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20

FROM ${NODE_IMAGE} AS source
ARG NOD_COMMIT=6cebbf1a448eba950d97e907bef8435e3a4e8b33
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init -q . && git remote add origin https://github.com/n8n-io/nod.git \
 && for i in 1 2 3 4 5; do git fetch -q --depth 1 origin "$NOD_COMMIT" && break; sleep 10; done \
 && git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "$NOD_COMMIT" && rm -rf .git

FROM ${NODE_IMAGE} AS rtk
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=source /src/src/providers/docker/install-rtk.sh /tmp/install-rtk.sh
RUN sh /tmp/install-rtk.sh prebuilt

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends python3 python-is-python3 python3-pip python3-venv python3-requests python3-bs4 pipx ffmpeg poppler-utils jq tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-por tesseract-ocr-spa tesseract-ocr-fra ca-certificates curl git unzip ripgrep libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji qpdf ghostscript zip xz-utils file sqlite3 tesseract-ocr-cat tesseract-ocr-ita tesseract-ocr-nld && rm -rf /var/lib/apt/lists/*
COPY --from=source /src/src/providers/docker/workspace-artifacts.txt /tmp/workspace-artifacts.txt
RUN python3 -m venv --system-site-packages /opt/nod-artifacts && /opt/nod-artifacts/bin/pip install --no-cache-dir --require-hashes -r /tmp/workspace-artifacts.txt && rm /tmp/workspace-artifacts.txt
COPY --from=rtk --chmod=555 /opt/rtk/bin/rtk /usr/local/bin/rtk
COPY --from=rtk /opt/rtk/LICENSE /usr/share/doc/rtk/LICENSE
COPY --from=source /src/LICENSE /src/NOTICE /usr/share/doc/nod/
RUN mkdir -p /workspace /home/node/.local/bin && chown -R node:node /workspace /home/node
RUN groupadd --gid 1002 nod-connected && useradd --uid 1002 --gid 1002 --create-home --shell /usr/sbin/nologin nod-connected && chmod 700 /home/nod-connected
COPY --chmod=0755 nod-relay.mjs /opt/nod-relay/relay.mjs
COPY --chmod=0755 workspace-start.sh /usr/local/bin/workspace-start
ENV LANG=C.UTF-8
ENV NPM_CONFIG_PREFIX=/home/node/.local
ENV PIPX_HOME=/home/node/.local/pipx
ENV PIPX_BIN_DIR=/home/node/.local/bin
ENV PATH=/opt/nod-artifacts/bin:/home/node/.local/bin:$PATH
WORKDIR /workspace
CMD ["/usr/local/bin/workspace-start"]
