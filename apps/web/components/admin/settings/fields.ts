import { COURIER_NAMES, SETTING_SCHEMAS, type SettingKey } from '@pe/shared';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

export type FieldKind = 'text' | 'number' | 'checkbox' | 'lines' | 'checkbox-group' | 'readonly';

export interface FieldDef {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly help?: string;
  /** Empty input becomes `undefined` (optional schema field). */
  readonly optional?: boolean;
  /** Empty input becomes `null` (nullable schema field). */
  readonly nullable?: boolean;
  readonly options?: readonly string[];
}

export interface SettingMeta {
  readonly title: string;
  readonly description: string;
}

export const SETTING_META: Readonly<Record<SettingKey, SettingMeta>> = {
  announcement_bar: {
    title: 'Announcement bar',
    description: 'The single quiet line above the storefront header.',
  },
  promo_popup: {
    title: 'Promo popup',
    description: 'Off by default; shows once per visitor after a delay.',
  },
  free_shipping_threshold: {
    title: 'Free shipping',
    description: 'Order value from which shipping is free.',
  },
  brand: {
    title: 'Brand',
    description: 'Name, tagline and logo used across the storefront and emails.',
  },
  gst_profile: { title: 'GST profile', description: 'Appears on every invoice; keep it accurate.' },
  pickup_location: { title: 'Pickup location', description: 'Where couriers collect parcels.' },
  return_window_days: {
    title: 'Return window',
    description: 'Days after delivery during which returns are accepted.',
  },
  courier_preferences: { title: 'Couriers', description: 'Preferred couriers in priority order.' },
};

const PRIMITIVE_KEYS: ReadonlySet<SettingKey> = new Set([
  'free_shipping_threshold',
  'return_window_days',
]);

export const isPrimitiveKey = (key: SettingKey): boolean => PRIMITIVE_KEYS.has(key);

export const SETTING_FIELDS: Readonly<Record<SettingKey, readonly FieldDef[]>> = {
  announcement_bar: [
    { name: 'enabled', label: 'Show the announcement bar', kind: 'checkbox' },
    { name: 'text', label: 'Text', kind: 'text', help: 'Up to 120 characters.' },
  ],
  promo_popup: [
    { name: 'enabled', label: 'Enable the promo popup', kind: 'checkbox' },
    {
      name: 'headline',
      label: 'Headline',
      kind: 'text',
      optional: true,
      help: 'Up to 80 characters.',
    },
    {
      name: 'productSlug',
      label: 'Product slug',
      kind: 'text',
      optional: true,
      help: 'Lowercase letters, digits and hyphens.',
    },
    {
      name: 'delaySeconds',
      label: 'Delay (seconds)',
      kind: 'number',
      help: 'Between 3 and 10 seconds after the page loads.',
    },
  ],
  free_shipping_threshold: [
    {
      name: 'value',
      label: 'Threshold (paise)',
      kind: 'number',
      help: '₹599 is 59900. Orders at or above this amount ship free.',
    },
  ],
  brand: [
    { name: 'name', label: 'Brand name', kind: 'text', help: 'Up to 40 characters.' },
    { name: 'tagline', label: 'Tagline', kind: 'text', help: 'Up to 80 characters.' },
    {
      name: 'logoKey',
      label: 'Logo object key',
      kind: 'text',
      nullable: true,
      help: 'PNG or WebP key in the media bucket; leave blank to use the wordmark.',
    },
  ],
  gst_profile: [
    {
      name: 'gstin',
      label: 'GSTIN',
      kind: 'text',
      help: 'Tamil Nadu registration: 33 followed by 13 characters.',
    },
    { name: 'legalName', label: 'Legal name', kind: 'text' },
    {
      name: 'addressLines',
      label: 'Registered address',
      kind: 'lines',
      help: 'One address line per row, up to four.',
    },
    {
      name: 'isPlaceholder',
      label: 'This profile is still a placeholder',
      kind: 'checkbox',
      help: 'Untick once the real GSTIN is entered; the dashboard warns while ticked.',
    },
  ],
  pickup_location: [
    { name: 'name', label: 'Location name', kind: 'text' },
    { name: 'line1', label: 'Address line 1', kind: 'text' },
    { name: 'line2', label: 'Address line 2', kind: 'text', optional: true },
    { name: 'city', label: 'City', kind: 'text' },
    { name: 'state', label: 'State', kind: 'readonly', help: 'Tamil Nadu only in Phase 1.' },
    { name: 'pincode', label: 'PIN code', kind: 'text', help: 'Six digits.' },
    { name: 'phone', label: 'Phone', kind: 'text', help: '10-digit Indian mobile number.' },
  ],
  return_window_days: [
    {
      name: 'value',
      label: 'Return window (days)',
      kind: 'number',
      help: 'Between 7 and 30 days after delivery.',
    },
  ],
  courier_preferences: [
    {
      name: 'preferred',
      label: 'Preferred couriers',
      kind: 'checkbox-group',
      options: COURIER_NAMES,
    },
  ],
};

const lines = z.string().transform((raw) =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== ''),
);

/** Per-key form schema: primitives are wrapped in `{ value }`, multi-line text becomes an array. */
export const FORM_SCHEMAS: Readonly<Record<SettingKey, z.ZodType<FieldValues, FieldValues>>> = {
  announcement_bar: SETTING_SCHEMAS.announcement_bar,
  promo_popup: SETTING_SCHEMAS.promo_popup,
  free_shipping_threshold: z.strictObject({ value: SETTING_SCHEMAS.free_shipping_threshold }),
  brand: SETTING_SCHEMAS.brand,
  gst_profile: SETTING_SCHEMAS.gst_profile.extend({
    addressLines: lines.pipe(SETTING_SCHEMAS.gst_profile.shape.addressLines),
  }),
  pickup_location: SETTING_SCHEMAS.pickup_location,
  return_window_days: z.strictObject({ value: SETTING_SCHEMAS.return_window_days }),
  courier_preferences: SETTING_SCHEMAS.courier_preferences,
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toFormValues = (key: SettingKey, value: unknown): FieldValues => {
  if (isPrimitiveKey(key)) return { value };
  const record = isRecord(value) ? value : {};
  if (key === 'gst_profile') {
    const address = record['addressLines'];
    return { ...record, addressLines: Array.isArray(address) ? address.join('\n') : '' };
  }
  return { ...record };
};

export const fromFormValues = (key: SettingKey, values: FieldValues): unknown =>
  isPrimitiveKey(key) ? (values['value'] as unknown) : values;
