import type { PeerConnectionState } from "zero-trust-application-channel";

/**
 * IPeerConnectionTracker — peer bağlantı durumu portu (DIP).
 *
 * Application yalnız bu portu bilir; `PeerConnectionTracker` domain policy'si
 * uygular. Yalnız use-case'lerin kullandığı alt küme — adapter tarafındaki
 * heartbeat/sweep metotları port yüzeyine sızmaz.
 */
export interface IPeerConnectionTracker {
  /** Peer bağlandı/kaydoldu. */
  markConnected(peerId: string): void;
  /** Bağlantı kapandı — kayıt düşer. */
  markClosed(peerId: string): void;
  /** Bağlı mı (yalnız `connected` erişime açıktır). */
  isConnected(peerId: string): boolean;
  /** Tüm durumlar (keşif görünümü için). */
  snapshot(): ReadonlyMap<string, PeerConnectionState>;
}
