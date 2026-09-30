export interface LoginEvent {
  readonly userId: string;
  readonly sessionId: string;
  /** Guest session id sent by the BFF so the cart can be merged (P11). */
  readonly previousSessionId: string | null;
}

export type LoginListener = (event: LoginEvent) => Promise<void> | void;

export interface AuthHooks {
  onLogin(listener: LoginListener): () => void;
  emitLogin(event: LoginEvent): Promise<void>;
}

export const createAuthHooks = (): AuthHooks => {
  let listeners: readonly LoginListener[] = [];
  return {
    onLogin: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((existing) => existing !== listener);
      };
    },
    emitLogin: async (event) => {
      await Promise.all(
        listeners.map(async (listener) => {
          await listener(event);
        }),
      );
    },
  };
};
