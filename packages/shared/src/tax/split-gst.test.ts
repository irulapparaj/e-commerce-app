import { describe, expect, it } from 'vitest';

import { AppError } from '../errors';

import { ORIGIN_STATE, splitGst } from './split-gst';

const RATES = [5, 12, 18] as const;
const PRICES = [100, 8000, 9999, 100001] as const;

describe('splitGst', () => {
  describe.each(RATES)('at %d%%', (ratePercent) => {
    it.each(PRICES)(
      'splits %d paise for TN into CGST + SGST that sum to the price',
      (pricePaise) => {
        const split = splitGst({ pricePaise, ratePercent, destinationState: ORIGIN_STATE });
        const expectedTaxable = Math.round((pricePaise * 100) / (100 + ratePercent));

        expect(split.taxablePaise).toBe(expectedTaxable);
        expect(split.igstPaise).toBe(0);
        expect(split.taxablePaise + split.cgstPaise + split.sgstPaise + split.igstPaise).toBe(
          pricePaise,
        );
        expect(split.cgstPaise - split.sgstPaise).toBeGreaterThanOrEqual(0);
        expect(split.cgstPaise - split.sgstPaise).toBeLessThanOrEqual(1);
      },
    );

    it.each(PRICES)('splits %d paise for MH into IGST only', (pricePaise) => {
      const split = splitGst({ pricePaise, ratePercent, destinationState: 'MH' });

      expect(split.cgstPaise).toBe(0);
      expect(split.sgstPaise).toBe(0);
      expect(split.igstPaise).toBe(pricePaise - split.taxablePaise);
      expect(split.taxablePaise + split.igstPaise).toBe(pricePaise);
    });
  });

  it('gives CGST the extra paisa when the tax is odd', () => {
    const split = splitGst({ pricePaise: 100, ratePercent: 5, destinationState: 'TN' });

    expect(split).toEqual({ taxablePaise: 95, cgstPaise: 3, sgstPaise: 2, igstPaise: 0 });
  });

  it('matches the worked example ₹80.00 at 5% to TN', () => {
    expect(splitGst({ pricePaise: 8000, ratePercent: 5, destinationState: 'TN' })).toEqual({
      taxablePaise: 7619,
      cgstPaise: 191,
      sgstPaise: 190,
      igstPaise: 0,
    });
  });

  it('handles a zero price and a zero rate', () => {
    expect(splitGst({ pricePaise: 0, ratePercent: 18, destinationState: 'TN' })).toEqual({
      taxablePaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    });
    expect(splitGst({ pricePaise: 500, ratePercent: 0, destinationState: 'KA' })).toEqual({
      taxablePaise: 500,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    });
  });

  it.each([
    [{ pricePaise: -1, ratePercent: 5, destinationState: 'TN' }],
    [{ pricePaise: 10.5, ratePercent: 5, destinationState: 'TN' }],
    [{ pricePaise: 100, ratePercent: -5, destinationState: 'TN' }],
    [{ pricePaise: 100, ratePercent: 101, destinationState: 'TN' }],
    [{ pricePaise: 100, ratePercent: Number.NaN, destinationState: 'TN' }],
  ])('rejects invalid input %j', (input) => {
    expect(() => splitGst(input)).toThrow(AppError);
  });
});
