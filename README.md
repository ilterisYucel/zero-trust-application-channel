# Zero-Trust Application Channel

A generic, multiplexed WebSocket tunnel: one outbound connection carries HTTP
and WS reverse-proxying plus session management between a **peer** (agent side)
and a **hub**. The core library is transport-only and domain-free — every
deployment/consumer injects its own cookie name, allowlist, upstream routes and
log codes.

| Part | What | Distribution |
|:-----|:-----|:-------------|
| [`lib/`](lib/) | Core: frame codec, v2 wire protocol, `TunnelConnector`, `TunnelClient`, `SessionGateway`, `TunnelProxy`, local `Result` | **npm** [`zero-trust-application-channel`](https://www.npmjs.com/package/zero-trust-application-channel) |
| [`hub/`](hub/) | Hub service: peer registry/discovery, opaque service access, consumer relay, bootstrap identity (hexagonal) | **Docker** |
| [`agent/`](agent/) | Peer agent: single-binary CLI (`run/setup/wizard/uninstall`), bootstrap claim, systemd install | **Binary** (GitHub Releases) + Docker |

## Why this exists

- **Problem:** data from software running inside battery-storage containers
  needed to be collected, but for security reasons those machines could not be
  exposed to the internet — no inbound ports, no public endpoints.
- **Gap:** existing options were either vendor-bound services (Cloudflare
  Tunnel, ngrok) or standalone self-hosted daemons (frp, rathole, chisel)
  with their own config and lifecycle — none was a platform-independent,
  dependency-light library that plugs into an existing web application with
  session and audit semantics.
- **Trajectory:** the tunnel was first used between an energy-management
  platform's web services, then to surface industrial edge devices (e.g.
  Revolution Pi dashboards) inside a web UI — which is why the package stays
  generic: transport-only core, and each consumer injects its own domain
  behaviour (cookie name, allowlist, upstream routes, log codes).

## Quick start

### Library (npm)

```bash
npm install zero-trust-application-channel
# or: bun add zero-trust-application-channel
```

Peer (client) side — one outbound WS carries register, control messages and
tunnel streams; the local service becomes reachable through the hub without
any inbound port:

```ts
import {
  ReconnectDelay,
  TunnelClient,
  TunnelConnector,
  WsSocketClientFactory,
} from "zero-trust-application-channel";

const connector = new TunnelConnector(
  {
    wsUrls: ["wss://hub.example.com/ws/peer"],
    token: process.env.PEER_TOKEN ?? "",
    peerId: "gateway-1",
    peerType: "device",
    services: [{ id: "local-admin" }],
    heartbeatIntervalMs: 15_000,
    registerTimeoutMs: 5_000,
    livenessTimeoutMs: 45_000,
  },
  new WsSocketClientFactory(),
  new ReconnectDelay({ baseMs: 200, maxMs: 2_000, jitterSpanMs: 0, jitter: () => 0 }),
);

const client = TunnelClient.create({
  webServiceUrl: "http://localhost:3000",
  staticUrl: "http://localhost:3000",
});
client.attach(connector);
await connector.start();
```

The hub side (`SessionGateway` + `TunnelProxy`) is the `hub/` service below, or
embedded in your own app by injecting `IHubChannel`/`IStreamSink`/`IAuditSink`
adapters — see [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

### Hub (Docker)

```bash
docker run -p 5003:5003 \
  -e PEER_TOKEN="${PEER_TOKEN}" \
  -e CONSUMER_TOKEN="${CONSUMER_TOKEN}" \
  -e HUB_DB_PATH=/data/hub.db \
  -v hub-data:/data \
  ilterisyucel/zero-trust-application-channel-hub:1.1.3
```

Replace `ilterisyucel` with your own Docker Hub user/org. Image tags are
published alongside repository releases. Alternatively, build locally:
`docker build -f hub/Dockerfile .`

### Agent (binary)

Prebuilt binaries are distributed via GitHub **Releases** (no binaries are
committed to the repository):

```bash
# example: linux-arm64
curl -L -o agent https://github.com/ilterisYucel/zero-trust-application-channel/releases/download/v1.1.3/agent-arm64
chmod +x agent && sudo mv agent /usr/local/bin/agent
agent run    # or: agent setup → systemd unit
```

Build from source: `bun run build:agent:arm64` / `bun run build:agent:x64`.

## Contracts (short)

- `decode` never throws; wire protocol is **v2-only** (`peerId` + required `peerType`).
- Single outbound WS: control messages and binary frames share the same channel.
- `hub`/`agent` depend on `lib` via `^1.0.0` (workspace link in this repo); `lib`
  has no application imports — only `ws` + `zod` (+ optional `jose` test helper).
- Full contracts: [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Docs

- [lib SPEC](docs/LIB-MIMARISI.md) · [hub SPEC](docs/HUB-MIMARISI.md) · [agent SPEC](docs/AGENT-MIMARISI.md) · [contracts](docs/CONTRACTS.md)

## Development

```bash
bun install
bun run test        # lib + hub + agent
bun run build       # lib dist + hub bundle
```

## License

MIT
