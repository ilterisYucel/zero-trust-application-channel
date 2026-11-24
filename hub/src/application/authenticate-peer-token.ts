import type { IPeerCredentialsStore } from "../domain/ports/peer-credentials-store";

/** IAuthenticatePeerToken — peer token doğrulama use-case kontratı (DIP). */
export interface IAuthenticatePeerToken {
  execute(token: string): Promise<boolean>;
}

/** Peer token kaynağından kimlik doğrular (saf use-case). */
export class AuthenticatePeerToken implements IAuthenticatePeerToken {
  constructor(private readonly store: IPeerCredentialsStore) {}

  execute(token: string): Promise<boolean> {
    return this.store.authenticate(token);
  }
}
