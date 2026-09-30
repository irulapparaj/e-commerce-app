import type { Masked } from './masking';
import { maskPhone } from './masking';

/**
 * Compile-time guard for the Masked brand (P08 §6): a raw string must not be assignable to a
 * Masked field. `tsc` fails if either expectation stops holding; nothing here runs.
 */
interface StaffVisibleDto {
  readonly maskedPhone: Masked;
}

export const acceptsMasked: StaffVisibleDto = { maskedPhone: maskPhone('9876543210') };

// @ts-expect-error a raw phone number must never satisfy a Masked field
export const rejectsRaw: StaffVisibleDto = { maskedPhone: '9876543210' };
