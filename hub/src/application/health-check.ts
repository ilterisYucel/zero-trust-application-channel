import type { IPeerConnectionTracker } from "../domain/ports/peer-connection-tracker";
import type { IPeerRegistry } from "../domain/ports/peer-registry";

/** Sağlık durumu DTO'su. */
export interface HealthStatus {
  readonly status: "ok" | "degraded";
  readonly peers: number;
  readonly connectedPeers: number;
}

/** HealthCheck — servis sağlığı use-case'i. */
export class HealthCheck {
  constructor(
    private readonly registry: IPeerRegistry,
    private readonly tracker: IPeerConnectionTracker,
  ) {}

  execute(): HealthStatus {
    const peers = this.registry.peers();
    const connectedPeers = peers.filter((peer) =>
      this.tracker.isConnected(peer.peerId),
    ).length;
    return { status: "ok", peers: peers.length, connectedPeers };
  }
}
