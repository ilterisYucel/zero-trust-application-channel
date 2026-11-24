import type {
  HubPeerRecord,
  RegisterPeerInput,
  ServiceAnnouncement,
} from "zero-trust-application-channel";

/**
 * IPeerRegistry — hub peer + OPAK servis kaydı portu (DIP).
 *
 * Application yalnız bu portu bilir; bellek-içi `HubPeerRegistry` (lib) veya
 * tüketici adapter'ı uygular. Komutlar: `register`/`unregister`; sorgular:
 * `peers`/`servicesOf`.
 */
export interface IPeerRegistry {
  /** Peer'ı kaydeder/değiştirir — servis listesi yenisiyle DEĞİŞİR. */
  register(input: RegisterPeerInput): void;
  /** Peer kaydını düşürür (idempotent). */
  unregister(peerId: string): void;
  /** Kayıtlı tüm peer'lar (kayıt sırasında). */
  peers(): readonly HubPeerRecord[];
  /** Peer'ın duyurduğu opak servisler; kayıt yoksa boş dizi. */
  servicesOf(peerId: string): readonly ServiceAnnouncement[];
}
