# Contracts (MANDATORY)

This file carries the binding contracts for developers touching the tunnel
protocol/session. Source SPECs: [LIB](LIB-SPEC.md), [HUB](HUB-SPEC.md),
[AGENT](AGENT-SPEC.md).

## Connector contract

- **Single outbound WS:** peer→hub is outbound WSS only; there is NO inbound TCP/HTTP.
  Control messages and tunnel streams share the SAME channel (text = control,
  binary = flow).
- **State machine:** `offline → connecting → registered → connected ↔ backoff`.
  Error/401/register-timeout → backoff (`exp(2^n·1s)+jitter`, cap 60 s);
  `stop()` → offline. `generation` guard: stale socket events are ignored.
- **Register (v2-only):** `{ type:"register", peerId, peerType, protocolVersion:2 }`;
  non-v2 shapes (`containerId` etc.) are rejected — the hub rejects a different `protocolVersion`.
- **Operational config:** `register-ack.config` / `config-update` → zod (not STRICT,
  unknown keys stripped) → if valid, applied without restart; invalid →
  `configRejected`, previous config is kept.
- **Liveness:** ping on every heartbeat; `livenessTimeoutMs` without pong → close + backoff.

## Tunnel stream contract

- **Binary frame:** 9-byte header (streamId u32 BE + seq u32 BE + flags);
  flags `FIN 0x01 | RST 0x02 | WS_OP 0x04`. `decode` **never throws**
  (`Result`); encode throws on programmer error. `seq` is a SEPARATE counter per side.
- **Lifecycle:** the HUB assigns streamId; `stream-open` → `stream-open-ack` →
  binary body (≤64 KiB chunks) → `FIN`; error → `RST`. Without credit (`stream-window`)
  the body STOPS (no deadlock — the idle sweep closes it).
- **Limits:** 1 interactive session per peer, 16 concurrent streams,
  256 KiB window, session TTL 4 h / idle 15 min, stream idle 5 min;
  stale threshold 45 s, sweep 1 s.

## Session contract

- `open-session` → the peer produces a JWT with its OWN secret (`ITokenSigner`).
  The agent signer stamps and verifies the `type:"container-session"` tag; the lib
  payload does not define the tag — consumer signers must stamp it too. →
  `open-session-ack`. The consumer injects the cookie name (neutral default
  `tunnel_session`); **Path-scoped**, HttpOnly is the consumer's job.
- A user is NEVER written to the peer DB. Role mapping in the hub is one-to-one
  (`admin→admin`, `teknik→teknik`, `boss→boss`, `guest→guest`, `developer→developer`
  — see `lib/src/proxy/session-gateway.ts#mapSessionRole`).
- **Audit fail-closed:** if `IAuditSink.open` cannot be written, the session is NOT opened.

## Package boundary

- `lib` uses only `ws` + `zod` (the test helper `jose` is an optional peer).
  Any application import is FORBIDDEN — business/telemetry concepts and HTTP routes
  cannot enter the package.
- Discovery + access live in the consumer; the announcement is opaque (`id` + cosmetic `meta`),
  target address/protocol/health/endpoint fields are REJECTED by the STRICT schema.
- Injections: cookie name, allowlist/blocklist, connector log codes
  (`eventCodes`), upstream rule (`routeUpstream`) — defaults are neutral.
