import type { IPeerConnectionTracker } from "../domain/ports/peer-connection-tracker";
import type { IPeerRegistry } from "../domain/ports/peer-registry";

/** DisconnectPeer — bağlantı kapanışında kayıt temizliği (use-case). */
export class DisconnectPeer {
  constructor(
    private readonly registry: IPeerRegistry,
    private readonly tracker: IPeerConnectionTracker,
  ) {}

  execute(peerId: string): void {
    this.registry.unregister(peerId);
    this.tracker.markClosed(peerId);
  }
}
