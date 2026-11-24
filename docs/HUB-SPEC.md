---
status: active
space: architecture
tags: [architecture, lib, hub, zero-trust, spec]
review_date: 2026-11-10
---

# Zero-Trust Application Channel — Hub — Architecture (SPEC)

> **Workflow stage:** 1/4 — SPEC (Plan stage, DeepSeek V4 Pro).
> **Status:** AWAITING APPROVAL — implementation starts after developer approval.
> **Related:** `LIB-SPEC.md`, `AGENT-SPEC.md`.

## 1. Purpose and Context

Hub service (hexagonal): peer registration/discovery, session gateway, HTTP/WS proxy, opaque service access, consumer relay, bootstrap identity and deployment. The domain/application layer does NOT import frameworks; there are no monorepo imports (only the `zero-trust-application-channel` surface — the `lib` package as migrated).

| Layer | Scope |
|:------|:------|
| included | Session gateway (fail-closed audit), proxy (credit/deadlock), registry, opaque access, consumer relay, bootstrap identity, config/TLS |
| excluded | Wire/codec (CORE), agent setup (AGENT), web-service consumer |

## 2. Decisions (MANDATORY — user-approved, dated)

| Code | Decision | Outcome |
|:----|:---------|:--------|
| K1 | **Audit fail-closed**: if `IAuditSink.open` cannot be written, the session is NOT opened (`FatalError`) | Audit trail guaranteed |
| K2 | 1 session per peer; when the limit is reached, the existing session is closed with `"replaced"` | No double-click/crash lock-in |
| K3 | Ack timeout / peer not connected → `TransientError` | Transient error separation |
| K4 | TTL 4 h / idle 15 min sweep → `session-end` + audit close | Orphan cleanup |
| K5 | **Access ≠ discovery**: validation order is service announcement (404) → peer connected (503) → allowlist (403) → session | Authorization order is explicit |
| K6 | Root mount (A2): when hostMap is set, `/*` catch-all, allowlist is skipped BUT blocklist wins; Host resolution follows the single `resolveAccessContext` contract | Mount = authorization boundary |
| K7 | Stale `tunnel_session` cookie + no consumer token → 401 + `Set-Cookie Max-Age=0`; 1008 on WS | Honest failure |
| K8 | Header forwarding denylist: hop-by-hop + `x-tunnel-*` dropped; `authorization` forwarded ONLY on the cookie-session path | No token leak |
| K9 | Consumer channel isolation: consumer token ≠ peer token; peers cannot open the consumer channel | Channel separation |
| K10 | Bootstrap: single-use + 24h TTL; token/secret stored ONLY as HASH; auth mode `PEER_TOKEN` env (dev) otherwise sqlite+bootstrap (prod); if neither → startup fail-fast | Secure enrollment |
| K11 | Revocation order: identity FIRST, socket SECOND (re-enrollment only via a new bootstrap) | Access is definitive |
| K12 | Config fail-fast: `HUB_HOST_MAP` (`host[:port]=peerId/serviceId`), TLS BYO/self-signed; missing/invalid → startup rejected | No misconfiguration |

## 3. Current State / Root Causes

| Code | Finding | Evidence |
|:----|:--------|:---------|
| B1 | Two separate `isConnected` sources (`PeerChannelHub` socket map ↔ `PeerConnectionTracker` state) | `hub/src/` |
| B2 | `HubSessionStore` has no test file of its own (covered indirectly through the gateway) | same directory |
| B3 | Guest session conflict (AUTH B1) | `session-gateway.ts#mapSessionRole` |

## 4. Architecture

```text
/ws/peer ──► PeerChannelHub ──► RegisterPeer / DisconnectPeer ──► HubPeerRegistry
                 │
                 └──► SessionGateway (fail-closed audit) ──► HubSessionStore
/containers|/fields ──► TunnelProxy (HTTP/WS bridge, credit) ──► access-routes
/ws/consumer ──► ConsumerChannel (opaque relay)
/admin,/bootstrap ──► CreateBootstrap/ClaimBootstrap/RevokePeer ──► sqlite store
```

### 4.1 Contracts

| Symbol | Role |
|:-------|:-----|
| `lib/src/proxy/session-gateway.ts#SessionGateway` | Session gateway |
| `lib/src/proxy/tunnel-proxy.ts#TunnelProxy` | Proxy |
| `lib/src/hub/registry.ts#HubPeerRegistry` | Registry |
| `hub/src/application/register-peer.ts#RegisterPeer` | Registration |
| `hub/src/application/open-service-access.ts#OpenServiceAccess` | Access |
| `hub/src/application/relay-control.ts#RelayControl` | Relay |
| `hub/src/application/claim-bootstrap.ts#ClaimBootstrap` | Identity |
| `hub/src/config/hub-config.ts#loadHubConfig` | Config |

## 5. Purity Rules (MANDATORY)

1. `domain/`+`application/` do NOT import Fastify/ws/sqlite/env.
2. No monorepo imports; only the tunnel surface (K13-core).
3. Audit fail-closed (K1).
4. Code references use `#symbol`; line numbers are FORBIDDEN.

## 6. Use Cases

### 6.1 UC-1 — Session Gateway

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: openSession/closeSession, audit fail-closed, "replaced", TTL/idle
- excluded: proxy (UC-2)

**Flow:**
1. A session request arrives; audit is opened (fail-closed).
2. The peer session is created; if the limit is reached, the previous one is closed with `replaced`.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-1.1 | If audit cannot be written, no session is opened | AK-1.1 |
| FR-1.2 | A new session for the same peer closes the previous one with `replaced` | AK-1.2 |

**Acceptance Scenarios (GWT):**

1. **AK-1.1 — GIVEN** an audit sink error **WHEN** openSession **THEN** `FatalError`
2. **AK-1.2 — GIVEN** an open session **WHEN** a new session **THEN** the previous one is closed as `replaced`

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-1.1 | Fail-closed | unit (`session-gateway.test.ts`) | ⬜ |
| AK-1.2 | Replaced | unit | ⬜ |

**T Task List:**
- [ ] T-1: map UC-1 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Ack timeout | TransientError |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/proxy/session-gateway.ts` | Gateway |

### 6.2 UC-2 — Proxy (HTTP/WS Bridge)

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: stream-open→body→ack order, half-window credit, WS bridge, limits
- excluded: access authorization (UC-4)

**Flow:**
1. `stream-open` is sent.
2. Body frames go BEFORE the ack.
3. Credit is refreshed at half-window.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-2.1 | Credit is refreshed at the half-window threshold (no deadlock) | AK-2.1 |
| FR-2.2 | A WS upgrade that is not 101 returns 1013 to the browser | AK-2.2 |

**Acceptance Scenarios (GWT):**

1. **AK-2.1 — GIVEN** a large body **WHEN** credit drops to half **THEN** it is refreshed and the flow does not stall
2. **AK-2.2 — GIVEN** upstream 400 **WHEN** WS upgrade **THEN** 1013

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-2.1 | Deadlock | unit (`tunnel-proxy.test.ts`) | ⬜ |
| AK-2.2 | 1013 | unit | ⬜ |

**T Task List:**
- [ ] T-2: map UC-2 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Ack timeout | 10 s → RST |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `lib/src/proxy/tunnel-proxy.ts` | Proxy |

### 6.3 UC-3 — Peer Registration/Discovery

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: register, announcement validation, replaced socket, discovery view
- excluded: access (UC-4)

**Flow:**
1. The first frame is register; if invalid → `rejected` + close.
2. The same peer re-registers → the old socket is `replaced`.
3. The discovery view is produced.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-3.1 | Invalid/opacity-violating registers are rejected | AK-3.1 |
| FR-3.2 | The discovery view carries only identity + cosmetic meta | AK-3.2 |

**Acceptance Scenarios (GWT):**

1. **AK-3.1 — GIVEN** an announcement with a target field **WHEN** register **THEN** rejected
2. **AK-3.2 — GIVEN** a discovery request **WHEN** the view is built **THEN** no target address

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-3.1 | Reject | unit (`register-peer.test.ts`) | ⬜ |
| AK-3.2 | Discovery | unit (`discovery-view`) | ⬜ |

**T Task List:**
- [ ] T-3: map UC-3 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Heartbeat | Swallowed by the adapter |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `hub/src/application/register-peer.ts` | Registration |

### 6.4 UC-4 — Opaque Access Authorization

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: validation order, allowlist/blocklist, hostMap root-mount, header/cookie rules
- excluded: proxy flow (UC-2)

**Flow:**
1. The service announcement is checked (404).
2. Is the peer connected (503).
3. Allowlist (403) → session is opened.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-4.1 | Validation order matches K5 exactly | AK-4.1 |
| FR-4.2 | `authorization` is forwarded only on the cookie-session path | AK-4.2 |

**Acceptance Scenarios (GWT):**

1. **AK-4.1 — GIVEN** an unannounced service **WHEN** access **THEN** 404
2. **AK-4.2 — GIVEN** the consumer-token path **WHEN** headers are forwarded **THEN** authorization is dropped

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-4.1 | Order | unit (`open-service-access.test.ts`) | ⬜ |
| AK-4.2 | Header | unit (`access-routes.test.ts`) | ⬜ |

**T Task List:**
- [ ] T-4: map UC-4 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Root-mount | Blocklist wins |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `hub/src/application/open-service-access.ts` | Access |

### 6.5 UC-5 — Consumer Relay

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: channel isolation, opaque envelope, 404/503
- excluded: business semantics

**Flow:**
1. The consumer token is verified.
2. Messages flow opaquely inside a `{peerId, message}` envelope.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-5.1 | Peers cannot open the consumer channel | AK-5.1 |

**Acceptance Scenarios (GWT):**

1. **AK-5.1 — GIVEN** a peer token **WHEN** the consumer channel is attempted **THEN** rejected

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-5.1 | Isolation | unit (`relay-control.test.ts`) | ⬜ |

**T Task List:**
- [ ] T-5: map UC-5 acceptance test

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Unknown peer | 404 |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `hub/src/application/relay-control.ts` | Relay |

### 6.6 UC-6 — Bootstrap Identity

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: create/claim/revoke, single-use + TTL, hash, auth-mode fail-fast
- excluded: agent side (AGENT)

**Flow:**
1. Admin creates a bootstrap (plaintext returned only once, in the response).
2. Claim is atomic (used=1 + secret UPSERT).
3. Revoke cuts identity first.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-6.1 | Bootstrap is single-use and expires after 24h | AK-6.1 |
| FR-6.2 | Token/secret are stored only as hashes | AK-6.2 |

**Acceptance Scenarios (GWT):**

1. **AK-6.1 — GIVEN** a used bootstrap **WHEN** claim **THEN** rejected
2. **AK-6.2 — GIVEN** a record **WHEN** the DB is inspected **THEN** no plaintext

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-6.1 | Single use | unit (`claim-bootstrap.test.ts`) | ⬜ |
| AK-6.2 | Hash | unit (`sqlite-peer-credential-store.test.ts`) | ⬜ |

**T Task List:**
- [ ] T-6: map UC-6 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| No auth mode | Startup fail-fast |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `hub/src/application/{create,claim}-bootstrap.ts` | Identity |

## 7. Lifecycle and Error Categories

| Case | Behavior |
|:-----|:---------|
| Audit error | No session |
| Peer missing | 503 |
| Allowlist | 403 |
| Bootstrap | Single use |

## 8. Success Criteria (SC-x)

| Code | Criterion | Measurement |
|:----|:----------|:------------|
| SC-1 | Session/access tested (90+ tests) | command |
| SC-2 | Audit fail-closed proven | command |
| SC-3 | No plaintext secrets | code review |
| SC-4 | Hexagonal boundary + DIP deterministically enforced | `bun run check` (CI) |

## 9. Stage Mapping (workflow)

| Stage | Artifact |
|:------|:---------|
| 1. SPEC (Plan — V4 Pro) | This document |
| 2. CONTRACT + TEST (Build — V4.1 Flash) | Structural module — 16 test files / 71 tests |
| 3. IMPL + MUTATION (Build — V4.1 Flash) | T-1..T-6 (evidence mapping) |
| 4. REVIEW (GLM-5.3) | `HUB-CLOSURE.md` |

## 10. Open Decisions

| # | Topic | Status |
|:--|:------|:-------|
| A1 | Unify the two `isConnected` sources (B1) | Future Work |
| A2 | `HubSessionStore` test debt (B2) | Future Work |
| A3 | Guest session decision (B3 — AUTH A1) | Future Work |

## 11. Future Work (NOT in this package — reference)

1. `isConnected` unification (A1).
2. Session store test (A2).
3. Multi-port/TLS live verification.

## 12. T Task Summary

| T-1 | Map UC-1 (session) acceptance tests |
| T-2 | Map UC-2 (proxy) acceptance tests |
| T-3 | Map UC-3 (registration/discovery) acceptance tests |
| T-4 | Map UC-4 (access) acceptance tests |
| T-5 | Map UC-5 (relay) acceptance test |
| T-6 | Map UC-6 (bootstrap) acceptance tests |
