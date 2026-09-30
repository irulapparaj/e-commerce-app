import { z } from 'zod';

/** A single line stored in the cart (no price — server-side pricing only). */
export const CartItemRow = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(0).max(20),
});
export type CartItemRow = z.infer<typeof CartItemRow>;

/** Full cart document stored in Valkey. */
export const CartStorage = z.object({
  items: z.array(CartItemRow),
  couponCode: z.string().optional(),
  updatedAt: z.string(),
});
export type CartStorage = z.infer<typeof CartStorage>;

/** POST /cart/items body — client nominates a variant and a quantity. */
export const AddItemBody = z
  .object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
  })
  .strict();
export type AddItemBody = z.infer<typeof AddItemBody>;

/** PUT /cart/items/:variantId body — quantity 0 means remove. */
export const UpdateItemBody = z
  .object({
    quantity: z.number().int().min(0).max(20),
  })
  .strict();
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;

/** POST|DELETE /cart/coupon body — stub until P23. */
export const CouponBody = z
  .object({
    code: z.string().min(1).max(50),
  })
  .strict();
export type CouponBody = z.infer<typeof CouponBody>;

/** Route param for item-level operations. */
export const variantIdParam = z.object({ variantId: z.string().uuid() });
export type VariantIdParam = z.infer<typeof variantIdParam>;
