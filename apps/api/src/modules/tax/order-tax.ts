import { splitGst } from '@pe/shared';

/** SAC 9968: Courier/Logistics services; attracts 18% GST. */
export const SHIPPING_SAC_CODE = '9968';

/** GST rate applicable to courier services under SAC 9968. */
export const SHIPPING_GST_RATE = 18;

export interface OrderLineItem {
  readonly unitPricePaise: number;
  readonly quantity: number;
  /** GST rate for this item, e.g. 5, 12, or 18. */
  readonly gstRatePercent: number;
}

export interface OrderTotals {
  /** Sum of all line-item prices (GST-inclusive). */
  readonly subtotalPaise: number;
  /** Shipping charge (GST-inclusive, SAC 9968 @ 18%). */
  readonly shippingPaise: number;
  /** Coupon or promotional discount applied to the order. */
  readonly discountPaise: number;
  /** CGST on items; non-zero for intra-state orders only. */
  readonly cgstPaise: number;
  /** SGST on items; non-zero for intra-state orders only. */
  readonly sgstPaise: number;
  /** IGST on items; non-zero for inter-state orders only. */
  readonly igstPaise: number;
  /** CGST on shipping (intra-state, TN→TN); 0 for inter-state. */
  readonly shippingCgstPaise: number;
  /** SGST on shipping (intra-state, TN→TN); 0 for inter-state. */
  readonly shippingSgstPaise: number;
  /** IGST on shipping (inter-state, TN→!TN); 0 for intra-state. */
  readonly shippingIgstPaise: number;
  /** Taxable value of shipping (shippingPaise minus shipping tax). */
  readonly shippingTaxablePaise: number;
  /** Final payable total: subtotalPaise + shippingPaise − discountPaise. */
  readonly totalPaise: number;
}

/**
 * Compute full GST breakdown for an order.
 *
 * All prices are GST-inclusive paise values. Shipping uses SAC 9968 at 18%.
 * Intra-state orders (destination === ORIGIN_STATE 'TN') produce CGST + SGST;
 * inter-state orders produce IGST.
 */
export const computeOrderTax = (
  items: readonly OrderLineItem[],
  shippingPaise: number,
  destinationState: string,
  discountPaise = 0,
): OrderTotals => {
  let subtotalPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  for (const item of items) {
    const linePaise = item.unitPricePaise * item.quantity;
    subtotalPaise += linePaise;
    const split = splitGst({
      pricePaise: linePaise,
      ratePercent: item.gstRatePercent,
      destinationState,
    });
    cgstPaise += split.cgstPaise;
    sgstPaise += split.sgstPaise;
    igstPaise += split.igstPaise;
  }

  // SAC 9968: courier services at 18% GST (GST-inclusive price).
  const shippingGst =
    shippingPaise > 0
      ? splitGst({
          pricePaise: shippingPaise,
          ratePercent: SHIPPING_GST_RATE,
          destinationState,
        })
      : { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };

  const totalPaise = subtotalPaise + shippingPaise - discountPaise;

  return {
    subtotalPaise,
    shippingPaise,
    discountPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    shippingCgstPaise: shippingGst.cgstPaise,
    shippingSgstPaise: shippingGst.sgstPaise,
    shippingIgstPaise: shippingGst.igstPaise,
    shippingTaxablePaise: shippingGst.taxablePaise,
    totalPaise,
  };
};
