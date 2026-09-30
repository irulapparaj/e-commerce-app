import { z } from 'zod';

import { brand } from '../brand';
import {
  COURIER_NAMES,
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  PICKUP_LOCATION_DEFAULT,
  RETURN_WINDOW_DAYS_DEFAULT,
} from '../constants';

import { phoneSchema, pincodeSchema, slugSchema } from './common';

/** Tamil Nadu GSTIN: state code 33 followed by PAN (10), entity number, Z, checksum. */
export const GSTIN_PATTERN = /^33[0-9A-Z]{13}$/;
/** Object keys for the brand logo must be raster images; SVG is never accepted (DESIGN §11.3). */
export const LOGO_KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.(png|webp)$/;

const ANNOUNCEMENT_MAX = 120;
const HEADLINE_MAX = 80;
const POPUP_DELAY_MIN = 3;
const POPUP_DELAY_MAX = 10;
const POPUP_DELAY_DEFAULT = 5;
const BRAND_NAME_MAX = 40;
const TAGLINE_MAX = 80;
const LEGAL_NAME_MAX = 120;
const ADDRESS_LINE_MAX = 120;
const ADDRESS_LINES_MAX = 4;
const RETURN_WINDOW_MIN = 7;
const RETURN_WINDOW_MAX = 30;
const COURIERS_MAX = 8;

const text = (max: number) => z.string().trim().max(max);

export const SETTING_SCHEMAS = {
  announcement_bar: z.strictObject({ enabled: z.boolean(), text: text(ANNOUNCEMENT_MAX) }),
  promo_popup: z.strictObject({
    enabled: z.boolean(),
    productSlug: slugSchema.optional(),
    headline: text(HEADLINE_MAX).optional(),
    delaySeconds: z
      .number()
      .int()
      .min(POPUP_DELAY_MIN)
      .max(POPUP_DELAY_MAX)
      .default(POPUP_DELAY_DEFAULT),
  }),
  free_shipping_threshold: z.number().int().min(0),
  brand: z.strictObject({
    name: text(BRAND_NAME_MAX).min(1),
    tagline: text(TAGLINE_MAX),
    logoKey: z.string().regex(LOGO_KEY_PATTERN, 'Logo must be a png or webp object key').nullable(),
  }),
  gst_profile: z.strictObject({
    gstin: z.string().regex(GSTIN_PATTERN, 'GSTIN must be a Tamil Nadu (33) registration'),
    legalName: text(LEGAL_NAME_MAX).min(1),
    addressLines: z.array(text(ADDRESS_LINE_MAX).min(1)).min(1).max(ADDRESS_LINES_MAX),
    isPlaceholder: z.boolean(),
  }),
  pickup_location: z.strictObject({
    name: text(LEGAL_NAME_MAX).min(1),
    line1: text(ADDRESS_LINE_MAX).min(1),
    line2: text(ADDRESS_LINE_MAX).optional(),
    city: text(HEADLINE_MAX).min(1),
    state: z.literal('TN'),
    pincode: pincodeSchema,
    phone: phoneSchema,
  }),
  return_window_days: z.number().int().min(RETURN_WINDOW_MIN).max(RETURN_WINDOW_MAX),
  courier_preferences: z.strictObject({
    preferred: z.array(z.enum(COURIER_NAMES as [string, ...string[]])).max(COURIERS_MAX),
  }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as readonly SettingKey[];
export type SettingValue<K extends SettingKey> = z.output<(typeof SETTING_SCHEMAS)[K]>;
export type SettingValues = { readonly [K in SettingKey]: SettingValue<K> };

export const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(SETTING_SCHEMAS, key);

export const parseSetting = <K extends SettingKey>(
  key: K,
  value: unknown,
): z.ZodSafeParseResult<SettingValue<K>> =>
  SETTING_SCHEMAS[key].safeParse(value) as z.ZodSafeParseResult<SettingValue<K>>;

/** Seeded on first boot; the GST profile stays a visible placeholder until the real GSTIN arrives. */
export const SETTING_DEFAULTS: SettingValues = {
  announcement_bar: { enabled: true, text: 'Free shipping on orders above ₹599' },
  promo_popup: { enabled: false, delaySeconds: POPUP_DELAY_DEFAULT },
  free_shipping_threshold: FREE_SHIPPING_THRESHOLD_DEFAULT,
  brand: { name: brand.name, tagline: brand.tagline, logoKey: null },
  gst_profile: {
    gstin: '33AAAAA0000A1Z5',
    legalName: `${brand.name} (placeholder)`,
    addressLines: ['Placeholder address', 'Chennai 600001'],
    isPlaceholder: true,
  },
  pickup_location: {
    name: `${brand.name} Warehouse`,
    line1: 'Placeholder address',
    city: PICKUP_LOCATION_DEFAULT.city,
    state: 'TN',
    pincode: PICKUP_LOCATION_DEFAULT.pincode,
    phone: '9000000000',
  },
  return_window_days: RETURN_WINDOW_DAYS_DEFAULT,
  courier_preferences: { preferred: [] },
};

/** Settings that change what the storefront home page renders (P04 revalidation tag `home`). */
export const HOME_SETTING_KEYS: readonly SettingKey[] = [
  'announcement_bar',
  'brand',
  'promo_popup',
  'free_shipping_threshold',
  'gst_profile',
];

/** Registered-business details shown in the storefront footer and on invoices. */
export interface PublicBusiness {
  readonly legalName: string;
  readonly gstin: string;
  readonly addressLines: readonly string[];
  readonly isPlaceholder: boolean;
}

export interface GrievanceOfficer {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

/** The subset of settings served to anonymous visitors by `GET /settings/public`. */
export interface PublicSettings {
  readonly brand: SettingValue<'brand'>;
  readonly announcementBar: SettingValue<'announcement_bar'>;
  readonly promoPopup: SettingValue<'promo_popup'>;
  readonly freeShippingThreshold: number;
  readonly pickupLocation: { readonly city: string };
  readonly business: PublicBusiness;
  readonly returnWindowDays: number;
  /** Optional; added when a contact_info setting exists. */
  readonly supportEmail?: string;
  /** Optional; added when a contact_info setting exists. */
  readonly grievanceOfficer?: GrievanceOfficer;
}

export const toPublicSettings = (values: SettingValues): PublicSettings => ({
  brand: values.brand,
  announcementBar: values.announcement_bar,
  promoPopup: values.promo_popup,
  freeShippingThreshold: values.free_shipping_threshold,
  pickupLocation: { city: values.pickup_location.city },
  business: {
    legalName: values.gst_profile.legalName,
    gstin: values.gst_profile.gstin,
    addressLines: values.gst_profile.addressLines,
    isPlaceholder: values.gst_profile.isPlaceholder,
  },
  returnWindowDays: values.return_window_days,
});
