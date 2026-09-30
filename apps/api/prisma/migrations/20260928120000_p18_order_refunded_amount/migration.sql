-- P18 review fix C-2: transactional refund accounting.
-- refunded_amount is the paise already sent to Razorpay for refund (initiated);
-- the refund cap is computed from this column under FOR UPDATE, never from note strings.
ALTER TABLE "order" ADD COLUMN "refunded_amount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order" ADD CONSTRAINT "order_refunded_amount_range" CHECK (
  "refunded_amount" >= 0 AND "refunded_amount" <= "total"
);
