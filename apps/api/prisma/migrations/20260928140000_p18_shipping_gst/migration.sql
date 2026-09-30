-- AlterTable: add shipping GST columns to order (H-34)
-- SAC 9968 courier services attract 18% GST; split into CGST+SGST (intra-state)
-- or IGST (inter-state) for GSTR-1 output-tax reporting.

ALTER TABLE "order"
  ADD COLUMN "shipping_cgst_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_sgst_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_igst_amount" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN "order"."shipping_cgst_amount" IS 'GST on shipping: CGST (intra-state) or 0 (inter-state); SAC 9968 courier at 18%';
COMMENT ON COLUMN "order"."shipping_sgst_amount" IS 'GST on shipping: SGST (intra-state) or 0 (inter-state); SAC 9968 courier at 18%';
COMMENT ON COLUMN "order"."shipping_igst_amount" IS 'GST on shipping: IGST (inter-state) or 0 (intra-state); SAC 9968 courier at 18%';
