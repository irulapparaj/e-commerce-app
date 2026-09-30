import { describe, expect, it } from 'vitest';

import { computeOrderTax, SHIPPING_GST_RATE, SHIPPING_SAC_CODE } from './order-tax';

/** ₹49 GST-inclusive: taxable=4153, tax=747 (cgst=374, sgst=373 intra; igst=747 inter). */
const FLAT_SHIPPING_PAISE = 4900;

describe('computeOrderTax', () => {
  describe('constants', () => {
    it('exports SAC 9968 and 18% GST rate for courier services', () => {
      expect(SHIPPING_SAC_CODE).toBe('9968');
      expect(SHIPPING_GST_RATE).toBe(18);
    });
  });

  describe('shipping GST — SAC 9968 @ 18%', () => {
    it('gives CGST + SGST and no IGST for intra-state delivery (TN→TN)', () => {
      const totals = computeOrderTax([], FLAT_SHIPPING_PAISE, 'TN');

      // taxable = round(4900 * 100 / 118) = 4153; tax = 747; cgst = ceil(747/2) = 374; sgst = 373
      expect(totals.shippingTaxablePaise).toBe(4153);
      expect(totals.shippingCgstPaise).toBe(374);
      expect(totals.shippingSgstPaise).toBe(373);
      expect(totals.shippingIgstPaise).toBe(0);
      // Components must reconcile to the gross shipping charge
      expect(
        totals.shippingTaxablePaise + totals.shippingCgstPaise + totals.shippingSgstPaise,
      ).toBe(FLAT_SHIPPING_PAISE);
    });

    it('gives IGST and no CGST/SGST for inter-state delivery (TN→MH)', () => {
      const totals = computeOrderTax([], FLAT_SHIPPING_PAISE, 'MH');

      expect(totals.shippingTaxablePaise).toBe(4153);
      expect(totals.shippingCgstPaise).toBe(0);
      expect(totals.shippingSgstPaise).toBe(0);
      expect(totals.shippingIgstPaise).toBe(747);
      expect(totals.shippingTaxablePaise + totals.shippingIgstPaise).toBe(FLAT_SHIPPING_PAISE);
    });

    it('returns all shipping GST fields as zero when shipping is free', () => {
      const totals = computeOrderTax([], 0, 'TN');

      expect(totals.shippingCgstPaise).toBe(0);
      expect(totals.shippingSgstPaise).toBe(0);
      expect(totals.shippingIgstPaise).toBe(0);
      expect(totals.shippingTaxablePaise).toBe(0);
    });
  });

  describe('item GST', () => {
    it('splits item tax into CGST + SGST for intra-state orders', () => {
      // Worked example from split-gst.test.ts: ₹80 at 5% to TN → cgst=191, sgst=190
      const items = [{ unitPricePaise: 8000, quantity: 1, gstRatePercent: 5 }];
      const totals = computeOrderTax(items, 0, 'TN');

      expect(totals.subtotalPaise).toBe(8000);
      expect(totals.cgstPaise).toBe(191);
      expect(totals.sgstPaise).toBe(190);
      expect(totals.igstPaise).toBe(0);
    });

    it('splits item tax into IGST for inter-state orders', () => {
      // 8000 paise at 5% to MH: taxable=7619, igst=381
      const items = [{ unitPricePaise: 8000, quantity: 1, gstRatePercent: 5 }];
      const totals = computeOrderTax(items, 0, 'MH');

      expect(totals.cgstPaise).toBe(0);
      expect(totals.sgstPaise).toBe(0);
      expect(totals.igstPaise).toBe(381);
    });

    it('multiplies item price by quantity before splitting GST', () => {
      const items = [{ unitPricePaise: 8000, quantity: 2, gstRatePercent: 5 }];
      const totals = computeOrderTax(items, 0, 'TN');

      // Line = 16000 paise at 5% to TN: taxable=15238, cgst=382, sgst=380
      expect(totals.subtotalPaise).toBe(16000);
      const expectedTaxable = Math.round((16000 * 100) / 105);
      const expectedTax = 16000 - expectedTaxable;
      const expectedCgst = Math.ceil(expectedTax / 2);
      expect(totals.cgstPaise).toBe(expectedCgst);
      expect(totals.sgstPaise).toBe(expectedTax - expectedCgst);
    });

    it('accumulates GST across multiple items', () => {
      const items = [
        { unitPricePaise: 8000, quantity: 1, gstRatePercent: 5 },
        { unitPricePaise: 10000, quantity: 1, gstRatePercent: 12 },
      ];
      const totals = computeOrderTax(items, 0, 'TN');

      expect(totals.subtotalPaise).toBe(18000);
      // Both items intra-state, so cgst/sgst > 0 and igst = 0
      expect(totals.cgstPaise).toBeGreaterThan(0);
      expect(totals.sgstPaise).toBeGreaterThan(0);
      expect(totals.igstPaise).toBe(0);
    });
  });

  describe('order totals', () => {
    it('computes the grand total as subtotal + shipping - discount', () => {
      const items = [{ unitPricePaise: 8000, quantity: 1, gstRatePercent: 5 }];
      const totals = computeOrderTax(items, FLAT_SHIPPING_PAISE, 'TN', 500);

      expect(totals.totalPaise).toBe(8000 + FLAT_SHIPPING_PAISE - 500);
      expect(totals.discountPaise).toBe(500);
      expect(totals.shippingPaise).toBe(FLAT_SHIPPING_PAISE);
    });

    it('defaults discount to zero when not supplied', () => {
      const totals = computeOrderTax([], FLAT_SHIPPING_PAISE, 'TN');

      expect(totals.discountPaise).toBe(0);
      expect(totals.totalPaise).toBe(FLAT_SHIPPING_PAISE);
    });

    it('returns zero totals for an empty order with free shipping', () => {
      const totals = computeOrderTax([], 0, 'TN');

      expect(totals.subtotalPaise).toBe(0);
      expect(totals.shippingPaise).toBe(0);
      expect(totals.discountPaise).toBe(0);
      expect(totals.cgstPaise).toBe(0);
      expect(totals.sgstPaise).toBe(0);
      expect(totals.igstPaise).toBe(0);
      expect(totals.shippingCgstPaise).toBe(0);
      expect(totals.shippingSgstPaise).toBe(0);
      expect(totals.shippingIgstPaise).toBe(0);
      expect(totals.shippingTaxablePaise).toBe(0);
      expect(totals.totalPaise).toBe(0);
    });
  });
});
