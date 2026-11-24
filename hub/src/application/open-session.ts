import { Result, NotFoundError, TransientError } from "zero-trust-application-channel";
import type { DomainError, TunnelUser } from "zero-trust-application-channel";
import type { IPeerConnectionTracker } from "../domain/ports/peer-connection-tracker";
import type { IPeerRegistry } from "../domain/ports/peer-registry";
import type { ISessionGateway } from "../domain/ports/session-gateway";

export interface OpenSessionInput {
  readonly peerId: string;
  readonly user: TunnelUser;
  readonly remoteIp?: string;
}

export interface OpenedSession {
  readonly sessionId: string;
  readonly token: string;
  readonly expiresInSec: number;
}

export interface OpenSessionConfig {
  /** Audit korelasyonu için hub site kimliği (verilmezse peerId). */
  readonly hubId?: string;
}

/**
 * OpenSession — tarayıcı/consumer için tünel oturumu açar.
 *
 * Peer kayıtlı ve bağlı olmalı; oturum `SessionGateway` üzerinden açılır
 * (audit portu çağrılır). Framework/HTTP bilmez — inbound adapter kullanır.
 */
export class OpenSession {
  constructor(
    private readonly registry: IPeerRegistry,
    private readonly tracker: IPeerConnectionTracker,
    private readonly gateway: ISessionGateway,
    private readonly config: OpenSessionConfig = {},
  ) {}

  async execute(
    input: OpenSessionInput,
  ): Promise<Result<OpenedSession, DomainError>> {
    const known = this.registry.peers().some(
      (peer) => peer.peerId === input.peerId,
    );
    if (!known) {
      return Result.err(
        new NotFoundError("hub.session.peer-not-found", "Peer bulunamadi"),
      );
    }
    if (!this.tracker.isConnected(input.peerId)) {
      return Result.err(
        new TransientError("hub.session.peer-offline", "Peer bagli degil"),
      );
    }

    const opened = await this.gateway.openSession({
      hubId: this.config.hubId ?? input.peerId,
      peerId: input.peerId,
      user: input.user,
      remoteIp: input.remoteIp,
    });
    if (opened.isErr()) {
      return Result.err(opened.error());
    }
    const outcome = opened.unwrap();
    return Result.ok({
      sessionId: outcome.sessionId,
      token: outcome.token,
      expiresInSec: outcome.expiresInSec,
    });
  }
}
