import { describe, expect, it, vi } from 'vitest';

import { createAuthHooks } from './hooks';

describe('auth hooks', () => {
  it('notifies every login listener and supports unsubscribe', async () => {
    const hooks = createAuthHooks();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = hooks.onLogin(first);
    hooks.onLogin(second);

    await hooks.emitLogin({ userId: 'u', sessionId: 's', previousSessionId: 'guest' });
    unsubscribe();
    await hooks.emitLogin({ userId: 'u', sessionId: 's2', previousSessionId: null });

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ userId: 'u', sessionId: 's', previousSessionId: 'guest' });
    expect(second).toHaveBeenCalledTimes(2);
  });
});
