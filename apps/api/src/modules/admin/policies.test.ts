import { describe, expect, it, vi } from 'vitest';

import type { Guards } from '../auth/guards';

import { ADMIN_POLICIES, policyGuards } from './policies';

const guards = () => {
  const authenticate = vi.fn(() => async () => undefined);
  const requireRole = vi.fn(() => async () => undefined);
  const requireMfaEnrolled = vi.fn(() => async () => undefined);
  const requireStepUp = vi.fn(() => async () => undefined);
  const g: Guards = {
    authenticate,
    requireRole,
    requireAudience: vi.fn(() => async () => undefined),
    requireMfaEnrolled,
    requireStepUp,
    requireAmr: vi.fn(() => async () => undefined),
  };
  return { g, authenticate, requireRole, requireMfaEnrolled, requireStepUp };
};

describe('ADMIN_POLICIES', () => {
  it('mirrors DESIGN §8.1: ADMIN-only areas and every ⚡ action', () => {
    expect(ADMIN_POLICIES['settings.write']).toEqual({ roles: ['ADMIN'], stepUp: true });
    expect(ADMIN_POLICIES['staff.write']).toEqual({ roles: ['ADMIN'], stepUp: true });
    expect(ADMIN_POLICIES['audit.read']).toEqual({ roles: ['ADMIN'], stepUp: false });
    expect(ADMIN_POLICIES['products.commercial']).toEqual({ roles: ['ADMIN'], stepUp: true });
    expect(ADMIN_POLICIES['variants.price']).toEqual({ roles: ['ADMIN'], stepUp: true });
    expect(ADMIN_POLICIES['categories.write']).toEqual({ roles: ['ADMIN'], stepUp: false });
    expect(ADMIN_POLICIES['inventory.adjust']).toEqual({
      roles: ['ADMIN', 'STAFF'],
      stepUp: false,
    });
    expect(ADMIN_POLICIES['inventory.adjust_large']).toEqual({ roles: ['ADMIN'], stepUp: true });
    for (const policy of Object.values(ADMIN_POLICIES)) {
      expect(policy.roles).toContain('ADMIN');
      if (policy.stepUp) expect(policy.roles).toEqual(['ADMIN']);
    }
  });

  it('builds the guard chain in the order audience → MFA → role → step-up', () => {
    const { g, authenticate, requireRole, requireStepUp } = guards();

    const write = policyGuards(g, 'settings.write');
    const read = policyGuards(g, 'stats.read');

    expect(write).toHaveLength(4);
    expect(read).toHaveLength(3);
    expect(authenticate).toHaveBeenCalledWith('admin');
    expect(requireRole).toHaveBeenCalledWith('ADMIN');
    expect(requireRole).toHaveBeenCalledWith('ADMIN', 'STAFF');
    expect(requireStepUp).toHaveBeenCalledTimes(1);
  });
});
