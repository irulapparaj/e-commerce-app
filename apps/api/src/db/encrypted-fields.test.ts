import { describe, expect, it } from 'vitest';

import { ENCRYPTED_FIELDS, ENCRYPTED_MODELS } from './encrypted-fields';

describe('ENCRYPTED_FIELDS', () => {
  it('covers exactly the DESIGN §7 PII fields (update this snapshot deliberately)', () => {
    expect(ENCRYPTED_FIELDS).toMatchInlineSnapshot(`
      {
        "Address": {
          "fields": [
            "phone",
            "line1",
            "line2",
          ],
        },
        "Order": {
          "fields": [
            "phone",
          ],
          "hmac": {
            "phone": "phoneHmac",
          },
          "json": {
            "shippingAddress": [
              "line1",
              "line2",
              "phone",
            ],
          },
        },
        "User": {
          "fields": [
            "phone",
          ],
          "hmac": {
            "phone": "phoneHmac",
          },
        },
      }
    `);
    expect(ENCRYPTED_MODELS).toEqual(['User', 'Address', 'Order']);
  });
});
