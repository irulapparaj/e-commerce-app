-- P14: add delivered_at timestamp to order for webhook-driven delivery tracking
ALTER TABLE "order"
  ADD COLUMN "delivered_at" TIMESTAMPTZ(3);
