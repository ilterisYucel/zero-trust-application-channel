---
status: active
space: architecture
tags: [architecture, lib, agent, zero-trust, spec]
review_date: 2026-11-10
---

# Zero-Trust Application Channel — Agent — Architecture (SPEC)

> **Workflow stage:** 1/4 — SPEC (Plan stage, DeepSeek V4 Pro).
> **Status:** AWAITING APPROVAL — implementation starts after developer approval.
> **Related:** `LIB-SPEC.md`, `HUB-SPEC.md`.

## 1. Purpose and Context

Peer agent (separate project): config parse/merge, bootstrap claim, HMAC-signed token, first-run setup UI, systemd installation, single-binary CLI (`run/setup/wizard/uninstall/config show`) and runtime wiring (connector + client + session server).

| Layer | Scope |
|:------|:------|
| included | Config, claim, HMAC, setup, systemd/install/uninstall, CLI, runtime wiring |
| excluded | Wire/connector (CORE), hub side (HUB) |

## 2. Decisions (MANDATORY — user-approved, dated)

| Code | Decision | Outcome |
|:----|:---------|:--------|
| K1 | Required: `HUB_URL`/`SERVICE_ID`/`LOCAL_TARGET` + identity (`PEER_TOKEN` ∨ `BOOTSTRAP_TOKEN` ∨ `PEER_SECRET`); `PEER_ID` falls back to hostname | Config fail-fast |
| K2 | `TLS_INSECURE` is effective ONLY for https targets | No accidental bypass |
| K3 | `mergeConfigEnv`: env overrides the file BUT a secret present in the file is preserved (persistent `PEER_SECRET` overrides the single-use token) | Identity persistence |
| K4 | Claim is **fail-closed**: network error / 4xx / `peerId` mismatch → tunnel does NOT start | No identity-less tunnel |
| K5 | Setup: bootstrap is SINGLE-USE — `/test` claims once, `/save` does NOT re-claim the same token; concurrent save → 409; `HUB_SECRET` is generated if missing | Secure setup |
| K6 | JWT `type:"container-session"` tag; `JoseSignerForTests` is FORBIDDEN in the agent | No token mixing |
| K7 | Systemd unit: `Restart=always`, `After/Wants=network-online.target`; config **0600**, unit 0644, binary 0755 | Resilient service |
| K8 | Uninstall: `systemctl` errors are SWALLOWED, file cleanup always runs | Clean removal |
| K9 | Single-binary CLI: `run|setup|wizard|uninstall|config show`; unknown command is an error | Single entry point |
| K10 | Runtime: `TunnelConnector` + `TunnelClient` + `ClientSessionServer`; backoff 200→2000 ms; `NODE_TLS_REJECT_UNAUTHORIZED=0` only for `tlsInsecure && https`; `stop()` order is sessionServer → connector → tunnelClient | Correct lifecycle |

## 3. Current State / Root Causes

| Code | Finding | Evidence |
|:----|:--------|:---------|
| B1 | `run.ts`/`cli.ts` untested — the agent's only real integration point | `agent/src/run.ts` |

## 4. Architecture

```text
CLI (args) ──► run | setup | wizard | uninstall | config show
                 │
run: parseAgentConfig ──► claim (fail-closed) ──► TunnelConnector ──► TunnelClient
                                                      └──► ClientSessionServer (HMAC token)

setup: SetupAgent (/test claims once, /save persists config) ──► systemd unit
```

### 4.1 Contracts

| Symbol | Role |
|:-------|:-----|
| `agent/src/config.ts#parseAgentConfig` | Config |
| `agent/src/claim-client.ts#BootstrapClaimClient` | Claim |
| `agent/src/hmac-signer.ts#signAgentToken` | Signing |
| `agent/src/setup-server.ts#SetupAgent` | Setup |
| `agent/src/systemd-unit.ts#renderSystemdUnit` | Unit |
| `agent/src/install.ts#uninstallAgent` | Installation |
| `agent/src/run.ts#startAgent` | Wiring |

## 5. Purity Rules (MANDATORY)

1. Secret file is 0600; no secrets in logs (K3/K7).
2. Claim is fail-closed (K4).
3. Single-binary CLI (K9).
4. Code references use `#symbol`; line numbers are FORBIDDEN.

## 6. Use Cases

### 6.1 UC-1 — Config + Identity

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: required fields, env/file merge, secret preservation, masking
- excluded: claim (UC-2)

**Flow:**
1. Config is parsed; required fields are validated.
2. Env overrides the file; the secret in the file is preserved.
3. `maskConfig` masks values for logs.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-1.1 | `PEER_SECRET` in the file overrides the env token | AK-1.1 |
| FR-1.2 | `TLS_INSECURE` is effective only for https | AK-1.2 |

**Acceptance Scenarios (GWT):**

1. **AK-1.1 — GIVEN** PEER_SECRET in the file, BOOTSTRAP_TOKEN in env **WHEN** merged **THEN** PEER_SECRET wins
2. **AK-1.2 — GIVEN** http target + TLS_INSECURE **WHEN** config **THEN** not effective

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-1.1 | Merge | unit (`config.test.ts`) | ⬜ |
| AK-1.2 | TLS | unit | ⬜ |

**T Task List:**
- [ ] T-1: map UC-1 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Missing required field | Fail-fast |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `agent/src/config.ts` | Config |

### 6.2 UC-2 — Bootstrap Claim + Setup

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: claim fail-closed, single-use setup, 409, HUB_SECRET generation
- excluded: systemd (UC-3)

**Flow:**
1. `/test` claims the bootstrap once.
2. `/save` does not re-claim the same token; it writes the config.
3. Concurrent save → 409.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-2.1 | A claim error does not start the tunnel | AK-2.1 |
| FR-2.2 | Setup does not claim the bootstrap a second time | AK-2.2 |

**Acceptance Scenarios (GWT):**

1. **AK-2.1 — GIVEN** hub unreachable **WHEN** claim **THEN** tunnel does not start
2. **AK-2.2 — GIVEN** /test done **WHEN** /save **THEN** no re-claim

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-2.1 | Fail-closed | unit (`claim-client.test.ts`) | ⬜ |
| AK-2.2 | Single use | unit (`setup-server.test.ts`) | ⬜ |

**T Task List:**
- [ ] T-2: map UC-2 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| peerId mismatch | Reject |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `agent/src/{claim-client,setup-server}.ts` | Claim/setup |

### 6.3 UC-3 — Installation / Uninstall

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: systemd unit, file permissions, uninstall order
- excluded: runtime (UC-4)

**Flow:**
1. The unit file is rendered; config is written with 0600.
2. On uninstall, systemctl errors are swallowed and files are removed.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-3.1 | Config 0600, unit 0644, binary 0755 | AK-3.1 |
| FR-3.2 | Uninstall always cleans up files | AK-3.2 |

**Acceptance Scenarios (GWT):**

1. **AK-3.1 — GIVEN** installation **WHEN** permissions are checked **THEN** 0600/0644/0755
2. **AK-3.2 — GIVEN** systemctl error **WHEN** uninstall **THEN** files are removed

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-3.1 | Permissions | unit (`install.test.ts`) | ⬜ |
| AK-3.2 | Cleanup | unit | ⬜ |

**T Task List:**
- [ ] T-3: map UC-3 acceptance tests

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| Unit already exists | Overwritten |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `agent/src/{systemd-unit,install}.ts` | Installation |

### 6.4 UC-4 — Runtime Wiring

**Status:** ✏️ Specified (pending approval)

**Scope:**
- included: startAgent composition, backoff, stop order, TLS bypass condition
- excluded: connector core (CORE)

**Flow:**
1. `startAgent` wires connector + client + session server.
2. `stop()` closes in reverse order.

**Requirements (FR-x):**

| Code | Requirement | Match |
|:----|:------------|:------|
| FR-4.1 | `stop()` order is sessionServer → connector → tunnelClient | AK-4.1 |

**Acceptance Scenarios (GWT):**

1. **AK-4.1 — GIVEN** a running agent **WHEN** stop **THEN** resources close in order

**Acceptance Criteria:**

| Code | Criterion | Evidence | Status |
|:----|:----------|:---------|:-------|
| AK-4.1 | Shutdown | code review + smoke (test debt B1) | ⬜ |

**T Task List:**
- [ ] T-4: map UC-4 smoke/evidence

**Edge Cases:**

| Case | Behavior |
|:-----|:---------|
| tlsInsecure + http | NODE_TLS_REJECT_UNAUTHORIZED is not set |

**Involved Files:**

| File | Role / Change |
|:-----|:--------------|
| `agent/src/run.ts` | Wiring |

## 7. Lifecycle and Error Categories

| Case | Behavior |
|:-----|:---------|
| Claim error | Tunnel does not start |
| Setup re-claim | 409 |
| systemctl error | Swallowed, cleanup continues |

## 8. Success Criteria (SC-x)

| Code | Criterion | Measurement |
|:----|:----------|:------------|
| SC-1 | Config/claim/setup tested (31 tests) | command |
| SC-2 | Permissions proven | command |
| SC-3 | Runtime smoke | Future Work |

## 9. Stage Mapping (workflow)

| Stage | Artifact |
|:------|:---------|
| 1. SPEC (Plan — V4 Pro) | This document |
| 2. CONTRACT + TEST (Build — V4.1 Flash) | Structural module — 7 test files / 31 tests |
| 3. IMPL + MUTATION (Build — V4.1 Flash) | T-1..T-4 (evidence mapping) |
| 4. REVIEW (GLM-5.3) | `AGENT-CLOSURE.md` |

## 10. Open Decisions

| # | Topic | Status |
|:--|:------|:-------|
| A1 | `run.ts`/`cli.ts` smoke test (B1) | Future Work |

## 11. Future Work (NOT in this package — reference)

1. Runtime smoke test (A1).
2. Windows service support (if requested).

## 12. T Task Summary

| T-1 | Map UC-1 (config/identity) acceptance tests |
| T-2 | Map UC-2 (claim/setup) acceptance tests |
| T-3 | Map UC-3 (installation) acceptance tests |
| T-4 | Map UC-4 (runtime) smoke/evidence |
