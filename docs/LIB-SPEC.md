---
status: active
space: architecture
tags: [architecture, lib, zero-trust, codec, spec]
review_date: 2026-11-10
---

# Zero-Trust Application Channel — Core — Architecture (SPEC)

> **Workflow stage:** 1/4 — SPEC (Plan stage, DeepSeek V4 Pro).
> **Status:** AWAITING APPROVAL — implementation starts after developer approval.
> **Related:** `HUB-SPEC.md`, `AGENT-SPEC.md`, `docs/CONTRACTS.md`.

## 1. Purpose and Context

Core library of the Zero-Trust Application Tunnel project: binary frame codec, v2 wire protocol, connector (peer→hub), client (peer-side stream multiplexer), channel ports. The package can be used independently of the monorepo / as a separate product.

| Layer | Scope |
|:------|:------|
| included | Codec, wire messages, connector state machine, client flow/limit management, channel ports |
| excluded | Hub session/proxy (HUB), agent setup (AGENT), web-service consumer |

## 2. Decisions (MANDATORY — user-approved, dated)

| Code | Decision | Outcome |
|:----|:---------|:--------|
| K1 | `decode` NEVER throws (untrusted WS input → `Result.err`); `encode` throws on programmer error — deliberate hybrid | Fuzz-proof |
| K2 | 9-byte header (streamId u32 BE + seq u32 BE + flags); `FIN 0x01`/`RST 0x02`/`WS_OP 0x04`; `MAX_CHUNK_SIZE` 64 KiB; `MAX_FRAME_PAYLOAD` 1 MiB; `streamId`/`seq` separate counters, `seq` diagnostics only | Frozen contract |
| K3 | Wire v2-ONLY: `peerId` + required `peerType`; v1 `containerId` fallback REMOVED | Single version |
| K4 | `serviceAnnouncementSchema` STRICT: target address/protocol/health/endpoint fields REJECTED | Opacity boundary |
| K5 | `TunnelOperationalConfig` carries only `heartbeatIntervalMs`; telemetry interval is NOT in the package | No domain leak |
| K6 | `TunnelRole` is a free string; role mapping/RBAC live in the consumer | Library stays neutral |
| K7 | Connector state machine: `offline→connecting→registered→connected↔backoff`; generation guard (stale socket events ignored) | Race-safe |
| K8 | Backoff `exp(2^n·1s)+jitter`, cap 60 s | No flapping |
| K9 | Register v2 (`peerId`+`peerType`+`protocolVersion`); `register-ack.config`/`config-update` zod → no restart; invalid → `configRejected` + previous config kept | Live config |
| K10 | Liveness: ping on every heartbeat; `livenessTimeoutMs` without pong → close + backoff | Half-dead connection detection |
| K11 | Client: credit-based backpressure (256 KiB), ≤64 KiB chunks, 16 concurrent stream cap → 503, idle/max-age sweep, **stream is closed after FIN** (22× max-streams regression), gzip headers stripped from ack (live `ERR_CONTENT_DECODING_FAILED`) | No deadlock/leak |
| K12 | Channel ports: `ISocketClient`/`ISocketClientFactory`/`ITunnelChannel`/`IHubChannel`; `onRejected(statusCode)` for pre-upgrade 401 | Transport-independent |
| K13 | Independence: only `ws` + `zod` + local Result; `@gd-monorepo/*` import is FORBIDDEN | Separate product |

## 3. Current State / Root Causes

| Code | Finding | Evidence |
|:----|:--------|:---------|
| B1 | A local `Result`/`DomainError` copy is carried (independence decision, DOMAIN-KALINTI K2) | `lib/src/result/` |
| B2 | Hub/agent packages have no `project.json` — they run via the vitest workspace | `*/package.json` |

## 4. Architecture

```text
Agent ──► TunnelConnector ──► ITunnelChannel (WsSocketClient) ──► hub /ws/peer
               │
               └──► TunnelClient (HTTP/WS multiplexer) ──► local target

Frame: [9B header][payload] ──► FrameCodec (decode → Result)
Wire:  register / register-ack / config-update / heartbeat / error / session-stream
```

### 4.1 Contracts

| Symbol | Role |
|:-------|:-----|
| `lib/src/codec/frame-codec.ts#FrameCodec` | Codec |
| `lib/src/codec/types.ts#TunnelFrame` | Frame type |
| `lib/src/protocol/messages.ts#TUNNEL_PROTOCOL_VERSION` | Wire version |
| `lib/src/connector/tunnel-connector.ts#TunnelConnector` | Connector |
| `lib/src/client/tunnel-client.ts#TunnelClient` | Client |
| `lib/src/channel/interface.ts#ITunnelChannel` | Channel port |

## 5. Purity Rules (MANDATORY)

1. The package carries no domain concepts (K5/K6).
2. `decode` never throws (K1).
3. Opacity: announcement target fields are rejected (K4).
4. Code references use `#symbol`; line numbers are FORBIDDEN.

## 6. Use Cases

### 6.1 UC-1 — Frame Codec

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: encode/decode, limits, flag/opcode combination, fuzz resilience
- excluded: wire messages (UC-2)

**Flow:**
1. Encode: header + payload.
2. Decode: validate; error → `Result.err`.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-1.1 | `decode` never throws on any input | AK-1.1 |
| FR-1.2 | Short/oversized frames are rejected | AK-1.2 |

**Acceptance Scenarios (GWT):**

1. **AK-1.1 — GIVEN** 1000 random bytes **WHEN** decode **THEN** no throw
2. **AK-1.2 — GIVEN** an 8-byte header **WHEN** decode **THEN** `Result.err`

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-1.1 | Fuzz | unit (`frame-codec.test.ts`) | ⬜ |
| AK-1.2 | Limit | unit | ⬜ |

**T Task List:**
- [ ] T-1: map UC-1 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Unknown opcode | Preserved for forward compatibility |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/codec/**` | Codec |

### 6.2 UC-2 — Wire Protocol

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: v2 messages, opaque announcement, operational config
- excluded: session/proxy (HUB)

**Flow:**
1. Peer sends a register message.
2. Hub returns ack/config.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-2.1 | Announcement target fields are rejected (opacity) | AK-2.1 |
| FR-2.2 | v2 messages require peerId + peerType | AK-2.2 |

**Acceptance Scenarios (GWT):**

1. **AK-2.1 — GIVEN** an announcement with a target address **WHEN** validated **THEN** rejected
2. **AK-2.2 — GIVEN** a register without peerType **WHEN** validated **THEN** rejected

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-2.1 | Opacity | unit (`messages.test.ts`) | ⬜ |
| AK-2.2 | Required field | unit | ⬜ |

**T Task List:**
- [ ] T-2: map UC-2 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Unknown message | Flows to subscribers |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/protocol/**` | Wire |

### 6.3 UC-3 — Connector Lifecycle

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: state machine, generation guard, backoff, liveness, live config
- excluded: agent wiring (AGENT)

**Flow:**
1. Connect → register → connected.
2. Error → backoff → retry.
3. Config updates apply without restart.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-3.1 | Stale socket events are ignored (generation) | AK-3.1 |
| FR-3.2 | Invalid config keeps the previous config | AK-3.2 |

**Acceptance Scenarios (GWT):**

1. **AK-3.1 — GIVEN** an old socket event **WHEN** a new connection is active **THEN** the event is ignored
2. **AK-3.2 — GIVEN** a malformed config-update **WHEN** applied **THEN** `configRejected`, previous config stays

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-3.1 | Generation | unit (`tunnel-connector.test.ts`) | ⬜ |
| AK-3.2 | Config | unit | ⬜ |

**T Task List:**
- [ ] T-3: map UC-3 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| 401 | `onRejected` → backoff |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/connector/**` | Connector |

### 6.4 UC-4 — Client Flow Management

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: credit/backpressure, limits, WS bridge, FIN close, gzip strip
- excluded: hub proxy (HUB)

**Flow:**
1. An HTTP/WS request becomes a stream.
2. When credit runs out, the body stops.
3. The stream is closed on FIN.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-4.1 | The 16 concurrent stream cap is enforced | AK-4.1 |
| FR-4.2 | The stream is closed after FIN (no leak) | AK-4.2 |

**Acceptance Scenarios (GWT):**

1. **AK-4.1 — GIVEN** a 17th stream **WHEN** opened **THEN** 503 is returned
2. **AK-4.2 — GIVEN** FIN sent **WHEN** state is inspected **THEN** the stream is closed

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-4.1 | Limit | unit (`tunnel-client.test.ts`) | ⬜ |
| AK-4.2 | Leak | unit | ⬜ |

**T Task List:**
- [ ] T-4: map UC-4 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Backpressure | Wait until credit arrives |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/client/**` | Client |

### 6.5 UC-5 — Channel Ports

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: port definitions, WS adapter, 401 path
- excluded: hub-side usage (HUB)

**Flow:**
1. The connector talks through `ITunnelChannel`.
2. The hub uses `IHubChannel`.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-5.1 | Channel ports are transport-independent | AK-5.1 |

**Acceptance Scenarios (GWT):**

1. **AK-5.1 — GIVEN** a different transport **WHEN** the port is implemented **THEN** the connector is unchanged

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-5.1 | Port abstraction | unit (`ws-socket-client.test.ts`) | ⬜ |

**T Task List:**
- [ ] T-5: map UC-5 acceptance test

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Pre-upgrade 401 | `onRejected` |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/channel/**` | Ports |

## 7. Lifecycle and Error Categories

| Case | Behavior |
|:-----|:---------|
| Decode error | `Result.err` |
| Connection loss | Backoff |
| Config error | Previous config |
| Stream cap | 503 |

## 8. Success Criteria (SC-x)

| Code | Criterion | Measurement |
|:----|:----------|:------------|
| SC-1 | Codec fuzz clean | command |
| SC-2 | Connector/client tested (198 tests) | command |
| SC-3 | Independence (no monorepo imports) | code review |

## 9. Stage Mapping (workflow)

| Stage | Artifact |
|:------|:---------|
| 1. SPEC (Plan — V4 Pro) | This document |
| 2. CONTRACT + TEST (Build — V4.1 Flash) | Structural module — 14 test files / 237 tests |
| 3. IMPL + MUTATION (Build — V4.1 Flash) | T-1..T-5 (evidence mapping) |
| 4. REVIEW (GLM-5.3) | `LIB-CLOSURE.md` |

## 10. Open Decisions

| # | Topic | Status |
|:--|:------|:-------|
| A1 | Local Result copy as a separate product boundary decision (B1) | Accepted |
| A2 | Nx project definition for hub/agent (B2) | Future Work |

## 11. Future Work (NOT in this package — reference)

1. Nx project definitions (A2).
2. Interop tests for third-party peer implementations.

## 12. T Task Summary

| T-1 | Map UC-1 (codec) acceptance tests |
| T-2 | Map UC-2 (wire) acceptance tests |
| T-3 | Map UC-3 (connector) acceptance tests |
| T-4 | Map UC-4 (client) acceptance tests |
| T-5 | Map UC-5 (channel ports) acceptance test |
