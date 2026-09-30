declare const maskedBrand: unique symbol;

/**
 * A string that has been through one of the masking functions below. Admin DTOs that STAFF can read
 * are typed with it, so adding a raw `phone` field to one of them fails `tsc` (P08 task 3).
 */
export type Masked<T extends string = string> = T & { readonly [maskedBrand]: true };

export const MASK_CHAR = '•';
const PHONE_KEEP_START = 2;
const PHONE_KEEP_END = 3;
const EMAIL_KEEP_START = 1;
const ADDRESS_MASK = MASK_CHAR.repeat(4);
const NAME_SEPARATOR = /\s+/;

const brand = (value: string): Masked => value as Masked;

/** `9876543210` → `98•••••210`; shorter values keep at most one clear character each side. */
export const maskPhone = (phone: string): Masked => {
  const digits = phone.trim();
  if (digits === '') return brand('');
  if (digits.length <= PHONE_KEEP_START + PHONE_KEEP_END) {
    const keep = Math.min(1, digits.length - 1);
    return brand(`${digits.slice(0, keep)}${MASK_CHAR.repeat(digits.length - keep)}`);
  }
  return brand(
    `${digits.slice(0, PHONE_KEEP_START)}${MASK_CHAR.repeat(
      digits.length - PHONE_KEEP_START - PHONE_KEEP_END,
    )}${digits.slice(-PHONE_KEEP_END)}`,
  );
};

/** `irul@example.com` → `i•••@example.com`; the domain stays readable for support conversations. */
export const maskEmail = (email: string): Masked => {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return brand(trimmed === '' ? '' : `${trimmed[0]}${MASK_CHAR.repeat(3)}`);
  const local = trimmed.slice(0, at);
  return brand(`${local.slice(0, EMAIL_KEEP_START)}${MASK_CHAR.repeat(3)}${trimmed.slice(at)}`);
};

/** `12 Temple Street` → `•••• Street`: only the last word survives. */
export const maskAddressLine = (line: string): Masked => {
  const words = line
    .trim()
    .split(NAME_SEPARATOR)
    .filter((word) => word !== '');
  const last = words.at(-1);
  return brand(last === undefined ? '' : `${ADDRESS_MASK} ${last}`);
};

/** `Irul Rajan` → `I. Rajan`; a single name becomes its initial. Unicode initials are preserved. */
export const maskName = (name: string): Masked => {
  const words = name
    .trim()
    .split(NAME_SEPARATOR)
    .filter((word) => word !== '');
  const first = words[0];
  if (first === undefined) return brand('');
  const initial = `${Array.from(first)[0] ?? ''}.`;
  const surname = words.at(-1);
  return brand(words.length === 1 || surname === undefined ? initial : `${initial} ${surname}`);
};

/** For values that are already public (city, order numbers) but sit in a masked DTO. */
export const asPublicValue = (value: string): Masked => brand(value);
