# agent

Zero-trust application channel **peer agent** — tek binary CLI:
`run | setup | wizard | uninstall | config show`.

## Kurulum (binary)

Build edilmiş binary'ler GitHub Releases'ten indirilir (repo içinde binary tutulmaz):

```bash
# örnek: v1.0.0, linux-arm64
curl -L -o agent https://github.com/ilterisYucel/zero-trust-application-channel/releases/download/v1.0.0/agent-arm64
chmod +x agent && sudo mv agent /usr/local/bin/agent
```

Kaynaktan: `bun run build:arm64` / `bun run build:x64` (çıktı `dist/`).

## Kullanım

```bash
agent setup     # bootstrap token ile tek seferlik claim + config + systemd unit
agent run       # tünel çalıştır
agent config show
agent uninstall
```

Env: `HUB_URL`, `PEER_ID`, `SERVICE_ID`, `LOCAL_TARGET`, `PEER_TOKEN` ∨
`BOOTSTRAP_TOKEN` ∨ `PEER_SECRET`, `TLS_INSECURE` (yalnız https hedefte etkin).
Config dosyası **0600**; kalıcı `PEER_SECRET` env token'ını ezer.

Sözleşmeler: [`../docs/AGENT-MIMARISI.md`](../docs/AGENT-MIMARISI.md),
[`../docs/CONTRACTS.md`](../docs/CONTRACTS.md).
