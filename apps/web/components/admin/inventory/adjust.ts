import { needsStepUpForAdjustment, STEP_UP_ADJUSTMENT_UNITS } from '@pe/shared';

import type { AdminRole } from '../Nav.config';

export const NOTE_MIN = 5;
export const STEP_UP_HINT = `Adjustments above ${STEP_UP_ADJUSTMENT_UNITS} units require an admin step-up.`;
export const STAFF_LIMIT_HINT = `Staff can adjust up to ${STEP_UP_ADJUSTMENT_UNITS} units at a time; ask an admin for larger changes.`;

export interface AdjustmentState {
  readonly delta: number | null;
  readonly previewStock: number | null;
  readonly needsStepUp: boolean;
  readonly blockedForStaff: boolean;
  readonly wouldGoNegative: boolean;
  readonly noteTooShort: boolean;
  readonly canSubmit: boolean;
}

/** Pure derivation for the dialog so the 100/101 boundary and role rules are unit-testable. */
export const adjustmentState = (
  deltaText: string,
  note: string,
  stock: number,
  role: AdminRole,
): AdjustmentState => {
  const parsed = Number(deltaText.trim());
  const delta =
    deltaText.trim() === '' || !Number.isInteger(parsed) || parsed === 0 ? null : parsed;
  const needsStepUp = delta !== null && needsStepUpForAdjustment(delta);
  const blockedForStaff = needsStepUp && role === 'STAFF';
  const previewStock = delta === null ? null : stock + delta;
  const wouldGoNegative = previewStock !== null && previewStock < 0;
  const noteTooShort = note.trim().length < NOTE_MIN;
  return {
    delta,
    previewStock,
    needsStepUp,
    blockedForStaff,
    wouldGoNegative,
    noteTooShort,
    canSubmit: delta !== null && !blockedForStaff && !wouldGoNegative && !noteTooShort,
  };
};
