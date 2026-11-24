import { Result, NotFoundError } from "zero-trust-application-channel";
import type {
  DomainError,
  ServiceAnnouncement,
} from "zero-trust-application-channel";
import type { IPeerConnectionTracker } from "../domain/ports/peer-connection-tracker";
import type { IPeerRegistry } from "../domain/ports/peer-registry";
import { toPeerSummaries } from "../domain/discovery-view";
import type { PeerSummary } from "../domain/discovery-view";

/** DiscoverPeers — keşif use-case'i (saf sorgular). */
export class DiscoverPeers {
  constructor(
    private readonly registry: IPeerRegistry,
    private readonly tracker: IPeerConnectionTracker,
  ) {}

  peers(): readonly PeerSummary[] {
    return toPeerSummaries(this.registry.peers(), this.tracker.snapshot());
  }

  servicesOf(
    peerId: string,
  ): Result<readonly ServiceAnnouncement[], DomainError> {
    const known = this.registry.peers().some((peer) => peer.peerId === peerId);
    if (!known) {
      return Result.err(
        new NotFoundError("hub.discovery.peer-not-found", "Peer bulunamadi"),
      );
    }
    return Result.ok(this.registry.servicesOf(peerId));
  }
}
