# AGENTS.md — zero-trust-application-channel

Generic, multiplexed WebSocket tunnel. **MIT · npm `zero-trust-application-channel` (lib) · Docker hub/agent.**

Bu dosya bu repoda çalışan ajanlar için bağlayıcı başlangıç noktasıdır.
Sözleşmeler: [`docs/CONTRACTS.md`](docs/CONTRACTS.md). SPEC'ler:
[`docs/LIB-MIMARISI.md`](docs/LIB-MIMARISI.md) · [`docs/HUB-MIMARISI.md`](docs/HUB-MIMARISI.md) · [`docs/AGENT-MIMARISI.md`](docs/AGENT-MIMARISI.md).

## Quick commands

```bash
bun install
bun run test              # lib + hub + agent
bun run typecheck
bun run build             # lib dist (npm) + hub bundle
bun run build:agent:arm64 # tek dosya binary → agent/dist/
bun run build:agent:x64
docker build -f hub/Dockerfile .
docker build -f agent/Dockerfile .
```

## Yapı

```
lib/    # npm çekirdeği (codec, protocol, connector, channel, client, session, proxy, result)
hub/    # hub servisi (hexagonal: domain → application → infrastructure; Fastify inbound)
agent/  # peer agent (CLI: run/setup/wizard/uninstall; systemd + tek binary)
docs/   # LIB/HUB/AGENT SPEC + CONTRACTS
tools/  # geliştirici harness'leri (hub-demo, peer-agent, revpi-agent-check, hub-image-parity)
```

`lib` üçünün de temelidir; `hub`/`agent` yalnız `lib`'e bağımlıdır
(`^1.0.0`, bu repoda workspace-link).

## Değişmez sözleşmeler (MANDATORY)

1. **Wire v2-only:** `register` = `peerId` + zorunlu `peerType` + `protocolVersion:2`;
   v1 `containerId` fallback YOKTUR. Sürüm değişikliği MAJOR + göç notu ister.
2. **Codec:** 9 bayt başlık, `decode` **asla throw etmez** (`Result`); limitler
   64 KiB chunk / 1 MiB frame. `seq` iki tarafta ayrı sayaçtır (yalnız teşhis).
3. **Tek outbound WS:** kontrol mesajları (text) + tünel stream'leri (binary)
   aynı kanaldan geçer; ayrı bağlantı açılmaz.
4. **Akış tavanları:** peer başına 1 etkileşimli oturum, 16 eşzamanlı stream,
   256 KiB kredi penceresi, TTL 4 sa / idle 15 dk, 60 sn ölü-socket sweep.
   Kredi yokken gövde DURUR (deadlock yok).
5. **Oturum:** `ITokenSigner` enjekte edilir, `type:"container-session"` etiketi
   zorunludur; kullanıcı peer DB'sine yazılmaz; cookie adı + Path-scoped/HttpOnly
   tüketicinin işidir. **Audit fail-closed:** `IAuditSink.open` yazılamazsa
   oturum açılmaz.
6. **Opaklık:** servis duyurusu yalnız `id` + kozmetik `meta` taşır; hedef
   adres/protocol/health/endpoint alanları STRICT şemada reddedilir.
7. **lib domain taşımaz:** telemetri/iş kavramı (BESS/konteyner/field/EMS),
   HTTP route, uygulama importu YASAK. Tek dış bağımlılık `ws` + `zod`
   (`jose` yalnız `./test-helpers` için opsiyonel peer).
8. **Hub hexagonal sınır:** `domain/` ve `application/` Fastify/ws/sqlite/env
   import ETMEZ; portlar (`IHubChannel`, `IStreamSink`, `IAuditSink`, …) enjekte edilir.

## Geliştirme kuralları

- **Testsiz davranış değişikliği yok.** `*.test.ts` co-located; hub/agent/lib
  kendi testlerini `bun run test` ile koşar.
- **Güvenlik-kritik modüller** (frame codec, connector, client, session-gateway,
  tunnel-proxy): branch ≥%90, mutasyon eşiği ≥%90.
- Named exports; ESM; `import type`; kebab-case dosya adları.
- Build artefaktı (`dist/`, `*.tsbuildinfo`, `test-results/`) commit edilmez;
  **binary imaj/dosya repo'ya KONMAZ** (Docker Hub + GitHub Releases).
- Docker imajları repo kök bağlamından derlenir (`-f hub/Dockerfile .`).

## Yayın

- **lib:** npm (`bun publish` in `lib/`, `prepublishOnly` = build + test);
  semver; kırıcı değişiklik = MAJOR + SPEC revizyonu.
- **hub/agent:** Docker Hub (`ilterisyucel/zero-trust-application-channel-{hub,agent}`,
  tag = sürüm + `latest`); agent ayrıca GitHub Releases binary (`agent-arm64/x64`).
- Tag `v<semver>` → `release.yml` (npm + Docker Hub; secret'lar: `NPM_TOKEN`,
  `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).

## İlgili

- Tüketici (EMS monorepo) yalnız `lib`'i npm'den ve hub/agent imajlarını çeker;
  adaptörler (`IHubChannel`/`IStreamSink`/`ITokenSigner` implementasyonları)
  tüketicide yaşar.
