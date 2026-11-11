# hub

The **hub service** for the channel: peer registration, discovery, opaque
service access and consumer relay. Hexagonal (ports & adapters) architecture —
the domain/application layers know nothing about Fastify/ws/sqlite.

> SPEC: [HUB-MIMARISI.md](../docs/HUB-MIMARISI.md)

## Layers

```
src/
├── domain/            # pure: PeerConnectionTracker, discovery-view, ports
├── application/       # use cases: RegisterPeer, DiscoverPeers, OpenServiceAccess,
│                      #   RelayControl, AuthenticatePeerToken/ConsumerToken, HealthCheck
├── infrastructure/
│   ├── inbound/       # Fastify routes, /ws/peer, /ws/consumer, stream sink
│   └── outbound/      # Env/Sqlite credential store, ConsoleLogger, MemoryAuditSink
├── config/            # env → HubConfig (fail-fast)
└── main.ts            # composition root (all wiring)
```

**Rule:** `domain/` and `application/` must not import Fastify/ws/sqlite/env.

## Endpoints

| Endpoint | Auth | Description |
|:---------|:-----|:------------|
| `WS /ws/peer` | `Authorization: Bearer <PEER_TOKEN>` | Peer uplink (register/heartbeat/stream) |
| `GET /peers` | — | Peer list (id/type/status/services) |
| `GET /peers/:peerId/services` | — | Service list |
| `GET/POST/... /peers/:pid/services/:sid/*` | consumer token + `x-tunnel-user-*` | Opaque HTTP access |
| `WS /peers/:pid/services/:sid/ws/*` | consumer token + `x-tunnel-user-*` | Opaque WS bridge |
| `POST /control/:peerId` | consumer token | Opaque control message to a peer |
| `WS /ws/consumer` | consumer token | Opaque messages from peers (`{peerId, message}`) |
| `GET /health` | — | Service health |
| `POST /admin/peers` | consumer token | Creates a peer + single-use bootstrap (sqlite mode) |
| `POST /peers/bootstrap/claim` | bootstrap token | Bootstrap → permanent `peerSecret` (sqlite mode) |
| `DELETE /admin/peers/:peerId` | consumer token | Revokes identity + drops the active connection |

**The consumer token is distinct from the peer token** — peers cannot open the
consumer channel.

## Auth modes

| Mode | Trigger | Behaviour |
|:-----|:--------|:----------|
| `env` | `PEER_TOKEN` set | Single shared token (dev/simple); bootstrap endpoints are INACTIVE |
| `sqlite` | no `PEER_TOKEN` + `HUB_DB_PATH` set | Bootstrap + permanent secret + revocation (prod) |

If neither is configured, startup fails fast.

> The browser cookie front-door (iframe/login) is a consumer-side integration
> layer, not part of this service.

## Run

```bash
PEER_TOKEN=... CONSUMER_TOKEN=... bun run start
bun run test
bun run typecheck
```

## Docker

Build from the repository root:

```bash
# published image:
docker run -p 5003:5003 -e PEER_TOKEN=... -e CONSUMER_TOKEN=... -e HUB_DB_PATH=/data/hub.db -v hub-data:/data ilterisyucel/zero-trust-application-channel-hub:1.0.0

# or build locally:
docker build -f hub/Dockerfile -t hub .
docker compose -f hub/compose.example.yml up
```

## Env

| Variable | Default | Notes |
|:---------|:--------|:------|
| `PORT` / `HOST` | `5003` / `0.0.0.0` | |
| `PEER_TOKEN` | — (required in env mode) | Single shared peer token (dev) |
| `CONSUMER_TOKEN` | — (required) | Consumer channel identity |
| `HUB_DB_PATH` | — (required in sqlite mode) | SQLite file (volume) |
| `HUB_COOKIE_NAME` | `tunnel_session` | |
| `HUB_ID` | — | Audit correlation |
| `HUB_STALE_TIMEOUT_MS` | `45000` | Stale threshold |
| `HUB_SWEEP_INTERVAL_MS` | `1000` | Sweep interval |
| `HUB_SESSION_TTL_MS` | `14400000` (4h) | Browser session absolute lifetime |
| `HUB_SESSION_IDLE_MS` | `900000` (15m) | Browser session idle timeout |
| `HUB_STREAM_IDLE_MS` | `300000` (5m) | Tunnel stream idle timeout (incl. terminal WS) |
| `HUB_ALLOWED_PREFIXES` | — | Comma-separated extra allowlist |
| `HUB_BLOCKED_PREFIXES` | — | Comma-separated blocklist |
