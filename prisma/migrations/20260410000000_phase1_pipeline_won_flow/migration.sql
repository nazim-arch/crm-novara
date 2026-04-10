-- Phase 1: Remove 3 pipeline stages, add Activity follow-up type,
--           add Won deal fields, add financing_required

-- ─────────────────────────────────────────────────────────────────
-- 1. Migrate existing lead data away from removed stages
-- ─────────────────────────────────────────────────────────────────
UPDATE "leads"
SET "status" = 'Qualified'
WHERE "status" IN ('Contacted', 'Requirement', 'OpportunityTagged');

-- ─────────────────────────────────────────────────────────────────
-- 2. Migrate stage history away from removed stages
-- ─────────────────────────────────────────────────────────────────
UPDATE "lead_stage_history"
SET "from_stage" = 'Qualified'
WHERE "from_stage" IN ('Contacted', 'Requirement', 'OpportunityTagged');

UPDATE "lead_stage_history"
SET "to_stage" = 'Qualified'
WHERE "to_stage" IN ('Contacted', 'Requirement', 'OpportunityTagged');

-- ─────────────────────────────────────────────────────────────────
-- 3. Replace LeadStatus enum (remove Contacted, Requirement, OpportunityTagged)
-- ─────────────────────────────────────────────────────────────────

-- Clean up partial state from any previous failed run
DROP TYPE IF EXISTS "LeadStatus_new";

CREATE TYPE "LeadStatus_new" AS ENUM (
  'New', 'Qualified', 'Visit', 'FollowUp', 'Negotiation',
  'Won', 'Lost', 'OnHold', 'Recycle'
);

-- Drop the DEFAULT first — PostgreSQL cannot auto-cast defaults when changing enum type
ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "leads"
  ALTER COLUMN "status" TYPE "LeadStatus_new"
  USING "status"::text::"LeadStatus_new";

ALTER TABLE "lead_stage_history"
  ALTER COLUMN "to_stage" TYPE "LeadStatus_new"
  USING "to_stage"::text::"LeadStatus_new";

ALTER TABLE "lead_stage_history"
  ALTER COLUMN "from_stage" TYPE "LeadStatus_new"
  USING "from_stage"::text::"LeadStatus_new";

DROP TYPE "LeadStatus";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";

-- Re-add the default after rename
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'New'::"LeadStatus";

-- ─────────────────────────────────────────────────────────────────
-- 4. Add Activity to FollowUpType enum
-- ─────────────────────────────────────────────────────────────────
ALTER TYPE "FollowUpType" ADD VALUE IF NOT EXISTS 'Activity';

-- ─────────────────────────────────────────────────────────────────
-- 5. Add new columns to leads
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "financing_required"      BOOLEAN,
  ADD COLUMN IF NOT EXISTS "settlement_value"        DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "deal_commission_percent" DECIMAL(8, 4);
