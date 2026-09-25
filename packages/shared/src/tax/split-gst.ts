import { AppError } from '../errors';
import type { Paise } from '../money';

export const ORIGIN_STATE = 'TN';

export interface SplitGstInput {
  readonly pricePaise: Paise | number;
  readonly ratePercent: number;
  readonly destinationState: string;
}

export interface GstSplit {
  readonly taxablePaise: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
}

const assertValid = ({ pricePaise, ratePercent }: SplitGstInput): void => {
  if (!Number.isInteger(pricePaise) || pricePaise < 0) {
    throw new AppError('VALIDATION', 'pricePaise must be a non-negative integer');
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new AppError('VALIDATION', 'ratePercent must be between 0 and 100');
  }
};

/**
 * R9: prices are GST-inclusive. taxable = round(price × 100 / (100 + rate)); tax = price − taxable.
 * Intra-state (TN) splits tax into CGST + SGST with CGST taking the odd paisa; otherwise IGST.
 */
export const splitGst = (input: SplitGstInput): GstSplit => {
  assertValid(input);
  const { pricePaise, ratePercent, destinationState } = input;
  const taxablePaise = Math.round((pricePaise * 100) / (100 + ratePercent));
  const taxPaise = pricePaise - taxablePaise;
  if (destinationState === ORIGIN_STATE) {
    const cgstPaise = Math.ceil(taxPaise / 2);
    return { taxablePaise, cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
  }
  return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
};
