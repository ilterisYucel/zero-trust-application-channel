# agent

Zero-trust application channel **peer agent** — a single-binary CLI:
`run | setup | wizard | uninstall | config show`.

## Install (binary)

Prebuilt binaries are distributed via GitHub Releases (no binaries are
committed to the repository):

```bash
# example: linux-arm64
curl -L -o agent https://github.com/ilterisYucel/zero-trust-application-channel/releases/download/v1.0.0/agent-arm64
chmod +x agent && sudo mv agent /usr/local/bin/agent
```

Build from source: `bun run build:arm64` / `bun run build:x64` (output in `dist/`).

## Usage

```bash
agent setup     # single-use bootstrap claim + config + systemd unit
agent run       # start the tunnel
agent config show
agent uninstall
```

Env: `HUB_URL`, `PEER_ID`, `SERVICE_ID`, `LOCAL_TARGET`, `PEER_TOKEN` or
`BOOTSTRAP_TOKEN` or `PEER_SECRET`, `TLS_INSECURE` (only effective for https
targets). The config file is written with mode **0600**; a persisted
`PEER_SECRET` overrides the env token.

Contracts: [`../docs/AGENT-MIMARISI.md`](../docs/AGENT-MIMARISI.md),
[`../docs/CONTRACTS.md`](../docs/CONTRACTS.md).
