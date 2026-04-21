-- Fix: replace partial unique index with a proper unique constraint
-- Prisma upsert uses ON CONFLICT ON CONSTRAINT which requires a real constraint,
-- not a partial index. The partial WHERE clause is unnecessary since the code
-- guards profileHandle != null before every upsert call.

DROP INDEX IF EXISTS "ir_lead_profileHandle_sourcePlatform_campaignId_key";

ALTER TABLE "ir_lead"
  ADD CONSTRAINT "ir_lead_profileHandle_sourcePlatform_campaignId_key"
  UNIQUE ("profileHandle", "sourcePlatform", "campaignId");
