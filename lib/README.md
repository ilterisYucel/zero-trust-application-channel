# zero-trust-application-channel

Generic, multiplexed WebSocket tunnel: HTTP/WS reverse-proxying and session
management over a single outbound connection. This package is the **core
library** — independent of any application or monorepo. Domain adapters
(Fastify/PG/container proxies) live in the consuming project.

**Two deployments, one package (v2):** the same generic package serves both
**field→container** and **field→boss** topologies — the register schema is
neutral (`peerId` + `peerType`), and session/cookie/allowlist behaviour is
injected via config (see [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md)).

## Contents

| Module | Responsibility |
|---|---|
| `codec` | Binary frame codec — 9-byte header (streamId u32 BE + seq u32 BE + flags FIN/RST/WS_OP); `decode` never throws (`Result`) |
| `protocol` | Control message types + zod schemas (register/ack — v2 `peerId` + `peerType`, heartbeat, telemetry, stream-*, open-session/*); `TUNNEL_PROTOCOL_VERSION = 2` |
| `connector` | `TunnelConnector` — outbound WS client + state machine + exponential backoff (`ReconnectDelay`) |
| `channel` | `ISocketClient`/`WsSocketClient` (ws adapter), `ITunnelChannel` (client side), `IHubChannel` (hub side, carries peerId) |
| `client` | `TunnelClient` — stream multiplexing, credit-based backpressure, dual upstream routing, WS bridge |
| `session` | `ClientSessionStore` + `ClientSessionServer` — ephemeral session JWT (`ITokenSigner` injection) |
| `proxy` | `SessionGateway` + `HubSessionStore` + `TunnelProxy` — hub-side session + HTTP/WS proxy (`IHubChannel`/`IStreamSink`/`IAuditSink` injection; cookieName + PathAllowlist config) |
| `logger` / `token` / `audit` / `snapshot` / `types` | Independence contracts — minimal `ILogger`, `ITokenSigner`, `IAuditSink`, `ISnapshotSource`, generic `TunnelRole`/`TunnelUser`/`TunnelTelemetryPoint` |

## Dependencies

`ws` + `zod` — nothing else. (`jose` is an optional peer, used only by the
`./test-helpers` subpath; production code works through injected
`ITokenSigner`.)

## Example — loopback end-to-end (no application code)

```bash
bun lib/examples/loopback-demo.mjs
```

In-package demo: `HubHarness` (hub side) ↔ `TunnelConnector` + `TunnelClient`
(client side) ↔ `SessionGateway` + `TunnelProxy` — register → session → tunnel
HTTP → WS bridge over a single real WS channel. The same flow runs as a test:

```bash
bun run test   # includes loopback.spec.ts
```

## Tests & quality gates

- `bun run test` — unit + spec + loopback end-to-end
- `bun run typecheck` — `tsc --noEmit` (production code, tests excluded)
- Security-critical modules (codec, connector, client, proxy) target ≥90%
  branch coverage.

## Contract summary

```ts
// Client side: TunnelConnector already is an ITunnelChannel
const client = TunnelClient.create({ webServiceUrl, staticUrl });
client.attach(connector);

// Hub side: inject an IHubChannel adapter (e.g. the in-package HubHarness or
// the consumer's container-proxy wrapper), an IStreamSink (the consumer's
// HTTP framework adapter), an IAuditSink and an ITokenSigner
const gateway = new SessionGateway(channel, store, audit, logger);
const proxy = new TunnelProxy(channel, store, logger);
```

The tunnel does NOT interpret roles: `TunnelRole` is a free string — mapping
and RBAC belong to the consumer. Detailed protocol: [`../docs/LIB-MIMARISI.md`](../docs/LIB-MIMARISI.md)
and [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md).
