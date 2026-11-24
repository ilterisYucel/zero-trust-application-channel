# AGENTS.md — zero-trust-application-channel

Generic, multiplexed WebSocket tunnel. **MIT · npm `zero-trust-application-channel` (lib) · Docker hub/agent.**

This file is the binding starting point for agents working in this repo.
Contracts: [`docs/CONTRACTS.md`](docs/CONTRACTS.md). SPECs:
[`docs/LIB-SPEC.md`](docs/LIB-SPEC.md) · [`docs/HUB-SPEC.md`](docs/HUB-SPEC.md) · [`docs/AGENT-SPEC.md`](docs/AGENT-SPEC.md).

## Quick commands

```bash
bun install
bun run test              # lib + hub + agent
bun run typecheck
bun run check             # deterministic architecture checks (contracts + arch)
bun run build             # lib dist (npm) + hub bundle
bun run build:agent:arm64 # single-file binary → agent/dist/
bun run build:agent:x64
docker build -f hub/Dockerfile .
docker build -f agent/Dockerfile .
```

## Layout

```
lib/    # npm core (codec, protocol, connector, channel, client, session, proxy, result)
hub/    # hub service (hexagonal: domain → application → infrastructure; Fastify inbound)
agent/  # peer agent (CLI: run/setup/wizard/uninstall; systemd + single binary)
docs/   # LIB/HUB/AGENT SPEC + CONTRACTS
tools/  # developer harnesses (hub-demo, peer-agent, revpi-agent-check, hub-image-parity)
```

`lib` is the foundation for all three; `hub`/`agent` depend only on `lib`
(`^1.0.0`, workspace-linked in this repo).

## Invariant contracts (MANDATORY)

1. **Wire v2-only:** `register` = `peerId` + required `peerType` + `protocolVersion:2`;
   non-v2 shapes (`containerId` etc.) are rejected. Version changes require MAJOR + a migration note.
2. **Codec:** 9-byte header, `decode` **never throws** (`Result`); limits
   64 KiB chunk / 1 MiB frame. `seq` is a separate counter per side (diagnostics only).
3. **Single outbound WS:** control messages (text) + tunnel streams (binary)
   share the same channel; no separate connection.
4. **Flow caps:** 1 interactive session per peer, 16 concurrent streams,
   256 KiB credit window; session TTL 4 h / idle 15 min, stream idle 5 min;
   stale threshold 45 s, sweep 1 s. Without credit the body STOPS (no deadlock).
5. **Session:** `ITokenSigner` is injected; the agent signer stamps and verifies
   `type:"container-session"` in the JWT (the lib payload does not define the tag —
   consumer signers must stamp it too). Users are never written to the peer DB;
   cookie name + Path-scoped/HttpOnly is the consumer's job. **Audit fail-closed:**
   if `IAuditSink.open` cannot be written, no session is opened.
6. **Opacity:** a service announcement carries only `id` + cosmetic `meta`; target
   address/protocol/health/endpoint fields are rejected by the STRICT schema.
7. **lib carries no domain:** business/telemetry concepts and application imports are
   FORBIDDEN; the only external dependencies are `ws` + `zod` (`jose` is an optional
   peer for `./test-helpers` only).
8. **Hub hexagonal boundary:** `domain/` and `application/` do NOT import
   Fastify/ws/sqlite/env; ports are injected (`IPeerRegistry`, `IPeerConnectionTracker`,
   `ISessionGateway`, `IConsumerRelay`, `IPeerCredentialsStore`, …). `bun run check` enforces this.

## Development rules

- **No behavior change without tests.** `*.test.ts` co-located; hub/agent/lib
  run their own tests via `bun run test`.
- **Security-critical modules** (frame codec, connector, client, session-gateway,
  tunnel-proxy): branch ≥90%, mutation threshold ≥90%.
- Named exports; ESM; `import type`; kebab-case file names.
- Build artifacts (`dist/`, `*.tsbuildinfo`, `test-results/`) are not committed;
  **binary images/files NEVER go into the repo** (Docker Hub + GitHub Releases).
- Docker images are built from the repo root context (`-f hub/Dockerfile .`).

## Deterministic checks

Architecture contracts are locked by deterministic scripts, not review
(`bun run check`; runs in CI):

- `tools/check-contracts.ts` — DIP: `hub/src/{domain,application}` constructor
  parameters must be I- contracts only (concrete class injection is rejected;
  method-less data shapes are exempt).
- `tools/hub-arch-checks.mjs` — hexagonal boundary: domain/application
  do not import Fastify/ws/sqlite and do not access env; `../infrastructure`/`../config` are forbidden.

## Release

- **lib:** npm (`bun publish` in `lib/`, `prepublishOnly` = build + test);
  semver; breaking change = MAJOR + SPEC revision.
- **hub/agent:** Docker Hub (`ilterisyucel/zero-trust-application-channel-{hub,agent}`,
  tag = version + `latest`); agent also ships GitHub Releases binaries (`agent-arm64/x64`).
- **One-command release:** `bun run release patch|minor|major` — runs
  typecheck/check/test, bumps `lib/package.json`, commits, tags `v<semver>` and
  pushes; the tag triggers `release.yml` (npm + Docker Hub + GitHub Releases
  binaries; secrets: `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).

## Related

- The consumer (EMS monorepo) pulls only `lib` from npm and the hub/agent images;
  adapters (`IHubChannel`/`IStreamSink`/`ITokenSigner` implementations) live in the consumer.
