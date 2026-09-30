export type { PublicSettings } from '@pe/shared';

/** `GET /api/v1/categories` — two levels, ordered by sortOrder then name (P04). */
export interface CategoryNode {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly imageUrl: string | null;
  readonly children: readonly CategoryNode[];
}

export interface ImageUrls {
  readonly src: string;
  readonly srcset: { readonly webp: string; readonly avif: string };
  readonly alt: string;
}

export interface RatingSummary {
  readonly avg: number;
  readonly count: number;
}

export interface ProductSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly categorySlug: string;
  readonly defaultVariantId: string | null;
  readonly priceFrom: number;
  readonly compareAtFrom: number | null;
  readonly image: ImageUrls | null;
  readonly isFeatured: boolean;
  readonly inStock: boolean;
  readonly lowStock: boolean;
  readonly ratingSummary: RatingSummary;
}

export interface VariantDto {
  readonly id: string;
  readonly label: string;
  readonly price: number;
  readonly compareAtPrice: number | null;
  readonly inStock: boolean;
  readonly lowStock: boolean;
  readonly isDefault: boolean;
}

export interface BreadcrumbDto {
  readonly name: string;
  readonly slug: string;
}

export interface ManufacturerDto {
  readonly name: string;
  readonly legalName: string;
  readonly addressLines: readonly string[];
}

export interface ProductDetailDto extends Omit<ProductSummaryDto, 'image'> {
  readonly descriptionHtml: string;
  readonly specifications: Readonly<Record<string, string>>;
  readonly howToUse: string | null;
  readonly tags: readonly string[];
  readonly variants: readonly VariantDto[];
  readonly images: readonly ImageUrls[];
  readonly breadcrumb: readonly BreadcrumbDto[];
  readonly related: readonly ProductSummaryDto[];
  readonly seo: { readonly metaTitle: string | null; readonly metaDescription: string | null };
  readonly hsnCode: string;
  readonly gstRate: number;
  readonly manufacturer: ManufacturerDto;
}

export type { EnvelopeMeta as PaginationMeta } from '@pe/shared';

export interface SearchResultDto {
  readonly products: readonly ProductSummaryDto[];
  readonly categories: readonly { readonly id: string; readonly slug: string; readonly name: string }[];
}

// ---- Checkout / Orders / Addresses ----

export interface AddressDto {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
}

export type AddressCreateInput = Omit<AddressDto, 'id' | 'isDefault' | 'createdAt'>;

export interface ServiceabilityDto {
  readonly serviceable: boolean;
  readonly etaDays: number | null;
  readonly ratePaise: number | null;
  readonly courier: string | null;
}

export interface OrderTax {
  readonly cgst: number;
  readonly sgst: number;
  readonly igst: number;
}

export interface OrderSummaryDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly paymentStatus: string;
  readonly subtotalPaise: number;
  readonly shippingPaise: number;
  readonly discountPaise: number;
  readonly tax: OrderTax;
  readonly totalPaise: number;
  readonly itemCount: number;
  readonly createdAt: string;
}

export interface OrderItemDto {
  readonly variantId: string;
  readonly productSlug: string;
  readonly name: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPricePaise: number;
  readonly lineTotalPaise: number;
  readonly hsnCode: string;
  readonly gstRate: number;
}

export interface OrderTimelineEntry {
  readonly status: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  readonly items: readonly OrderItemDto[];
  readonly address: AddressDto;
  readonly timeline: readonly OrderTimelineEntry[];
  readonly tracking: null;
}

export interface CreateOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly razorpayOrderId: string;
  readonly amountPaise: number;
  readonly keyId: string;
  readonly summary: OrderSummaryDto;
}
