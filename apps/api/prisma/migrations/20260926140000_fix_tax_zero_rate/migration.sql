-- DB-H2: Allow all-zero GST amounts for tax-exempt products.
-- The previous constraint rejected orders where every GST column is 0, breaking
-- zero-rated / tax-exempt product orders. Add the all-zero exempt case.

ALTER TABLE "order" DROP CONSTRAINT "order_tax_pair";
ALTER TABLE "order" ADD CONSTRAINT "order_tax_pair" CHECK (
    ("cgst_amount" = 0 AND "sgst_amount" = 0 AND "igst_amount" = 0)
    OR ("cgst_amount" > 0 AND "sgst_amount" > 0 AND "igst_amount" = 0)
    OR ("cgst_amount" = 0 AND "sgst_amount" = 0 AND "igst_amount" > 0)
    OR "total" = 0
);
