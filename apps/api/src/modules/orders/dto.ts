export interface AddressSnapshot {
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface OrderItemDto {
  readonly id: string;
  readonly variantId: string;
  readonly name: string;
  readonly variantLabel: string;
  readonly sku: string;
  readonly unitPricePaise: number;
  readonly lineTotalPaise: number;
  readonly quantity: number;
  readonly hsnCode: string;
  readonly gstRate: number;
}

export interface TimelineEvent {
  readonly status: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface OrderSummaryDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly subtotalPaise: number;
  readonly shippingPaise: number;
  readonly discountPaise: number;
  readonly tax: { readonly cgst: number; readonly sgst: number; readonly igst: number };
  readonly totalPaise: number;
  readonly itemCount: number;
  readonly createdAt: string;
}

export interface TrackingInfo {
  readonly awb: string | null;
  readonly courier: string | null;
  readonly url: string | null;
}

export interface OrderDetailDto extends OrderSummaryDto {
  readonly items: readonly OrderItemDto[];
  readonly address: AddressSnapshot;
  readonly timeline: readonly TimelineEvent[];
  readonly tracking: TrackingInfo;
  /** Placeholder until P22 adds return-request logic. */
  readonly canRequestReturn: false;
}
