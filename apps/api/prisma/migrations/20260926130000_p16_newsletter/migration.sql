-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "newsletter_subscriber" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_hash" TEXT NOT NULL,
    "email_encrypted" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING',
    "source" VARCHAR(40) NOT NULL DEFAULT 'storefront',
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "newsletter_subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriber_email_hash_key" ON "newsletter_subscriber"("email_hash");

-- CreateIndex
CREATE INDEX "newsletter_subscriber_status_idx" ON "newsletter_subscriber"("status");
