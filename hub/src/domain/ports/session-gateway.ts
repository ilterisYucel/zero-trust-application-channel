import type {
  DomainError,
  HubSession,
  OpenSessionInput,
  OpenSessionOutcome,
  Result,
} from "zero-trust-application-channel";

/**
 * ISessionGateway — hub oturum yöneticisi portu (DIP).
 *
 * Application yalnız bu portu bilir; lib `SessionGateway` uygular
 * (structural typing — adapter sarmalayıcı gerekmez).
 */
export interface ISessionGateway {
  /** Oturum açar (başarısızlık `Result` ile — beklenen alan hatası). */
  openSession(
    input: OpenSessionInput,
  ): Promise<Result<OpenSessionOutcome, DomainError>>;
  /** Peer başına açık oturumu bulur (sorgu). */
  sessionForPeer(peerId: string): HubSession | undefined;
}
