-- H-32: emailEncrypted can be set to NULL on DPDP erase
-- The table was created in 20260926130000_p16_newsletter; this migration extends it.
ALTER TABLE "newsletter_subscriber" ALTER COLUMN "email_encrypted" DROP NOT NULL;

-- H-33: add signed unsubscribe token for one-click unsubscribe links
ALTER TABLE "newsletter_subscriber" ADD COLUMN "unsubscribe_token" CHAR(43);
CREATE UNIQUE INDEX "newsletter_subscriber_unsubscribe_token_key" ON "newsletter_subscriber"("unsubscribe_token");
