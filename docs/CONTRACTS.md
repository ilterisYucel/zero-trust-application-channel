# Contracts (MANDATORY)

Bu dosya, tünel protokolüne/oturuma dokunan geliştiriciler için bağlayıcı
sözleşmeleri taşır. Kaynak SPEC'ler: [LIB](LIB-MIMARISI.md), [HUB](HUB-MIMARISI.md),
[AGENT](AGENT-MIMARISI.md).

## Connector sözleşmesi

- **Tek outbound WS:** peer→hub yalnızca outbound WSS; inbound TCP/HTTP YOKTUR.
  Kontrol mesajları ve tünel stream'leri AYNI kanaldan geçer (text = kontrol,
  binary = akış).
- **Durum makinesi:** `offline → connecting → registered → connected ↔ backoff`.
  Hata/401/register-timeout → backoff (`exp(2^n·1s)+jitter`, tavan 60 sn);
  `stop()` → offline. `generation` koruması: bayat soket olayları yok sayılır.
- **Register (v2-only):** `{ type:"register", peerId, peerType, protocolVersion:2 }`;
  v1 `containerId` fallback YOKTUR.
- **Operational config:** `register-ack.config` / `config-update` → zod (STRICT değil,
  bilinmeyen anahtar strip) → geçerliyse restart'sız uygulanır; geçersiz →
  `configRejected`, eski config korunur.
- **Liveness:** her heartbeat'te ping; `livenessTimeoutMs` pong yoksa kapat + backoff.

## Tünel stream sözleşmesi

- **Binary frame:** 9 bayt başlık (streamId u32 BE + seq u32 BE + flags);
  flags `FIN 0x01 | RST 0x02 | WS_OP 0x04`. `decode` **asla throw etmez**
  (`Result`); encode programcı hatasında throw eder. `seq` iki tarafta AYRI sayaç.
- **Yaşam döngüsü:** streamId'yi HUB atar; `stream-open` → `stream-open-ack` →
  binary gövde (≤64 KiB parça) → `FIN`; hata → `RST`. Kredi (`stream-window`)
  yoksa gövde DURUR (deadlock yok — idle sweep kapatır).
- **Limitler:** peer başına 1 etkileşimli oturum, 16 eşzamanlı stream,
  pencere 256 KiB, TTL 4 sa, idle 15 dk, 60 sn ölü socket sweep.

## Oturum sözleşmesi

- `open-session` → peer KENDİ secret'iyle JWT üretir (`ITokenSigner`;
  `type:"container-session"` etiketi — access token'la karışmaz) →
  `open-session-ack`. Cookie adı tüketici enjekte eder (varsayılan nötr
  `tunnel_session`); **Path-scoped**, HttpOnly uygulamak tüketicinin işidir.
- Kullanıcı peer DB'sine ASLA yazılmaz. Rol eşlemesi hub'da birebirdir
  (`admin→admin`, `teknik→teknik`, `boss→boss`, `guest→guest`, `developer→developer`
  — bkz. `lib/src/proxy/session-gateway.ts#mapSessionRole`).
- **Audit fail-closed:** `IAuditSink.open` yazılamazsa oturum AÇILMAZ.

## Paket sınırı

- `lib` yalnız `ws` + `zod` kullanır (test yardımcısı `jose` opsiyonel peer).
  Herhangi bir uygulama/monorepo importu YASAK — domain kavramı (telemetri,
  BESS/konteyner/field, HTTP route) pakete giremez.
- Keşif + erişim tüketicide yaşar; duyuru opaktır (`id` + kozmetik `meta`),
  hedef adres/protocol/health/endpoint alanları STRICT şemada REDDEDİLİR.
- Enjeksiyonlar: cookie adı, allowlist/blocklist, connector log kodları
  (`eventCodes`), upstream kuralı (`routeUpstream`) — varsayılanlar nötr.
