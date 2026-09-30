/**
 * Declares which columns the Prisma encryption extension protects (R6, DESIGN §7).
 * `fields` are encrypted scalar columns, `hmac` maps a field to its blind-index column and
 * `json` lists the keys inside a JSON column that are encrypted (the rest stays readable for
 * fulfilment: city, state, pincode). Adding a PII field is a conscious change: a snapshot test
 * guards this map.
 */
export interface EncryptedModelSpec {
  readonly fields: readonly string[];
  readonly hmac?: Readonly<Record<string, string>>;
  readonly json?: Readonly<Record<string, readonly string[]>>;
}

export const ENCRYPTED_FIELDS: Readonly<Record<string, EncryptedModelSpec>> = {
  User: { fields: ['phone'], hmac: { phone: 'phoneHmac' } },
  Address: { fields: ['phone', 'line1', 'line2'] },
  Order: {
    fields: ['phone'],
    hmac: { phone: 'phoneHmac' },
    json: { shippingAddress: ['line1', 'line2', 'phone'] },
  },
  NewsletterSubscriber: { fields: ['emailEncrypted'] },
};

export const ENCRYPTED_MODELS = Object.keys(ENCRYPTED_FIELDS);
