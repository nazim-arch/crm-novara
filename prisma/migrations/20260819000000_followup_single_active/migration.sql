-- Fix #3 — Single Active Follow-up (2026-08-19)
-- Adds a lifecycle status to follow-ups, guarantees at most one Active follow-up per lead
-- at the database level, and backfills existing data.

-- 1. Lifecycle enum
CREATE TYPE "FollowUpStatus" AS ENUM ('Active', 'Completed', 'Superseded', 'Cancelled');

-- 2. New columns (existing rows default to Active, then the backfill below reclassifies them)
ALTER TABLE "follow_ups" ADD COLUMN "status"           "FollowUpStatus" NOT NULL DEFAULT 'Active';
ALTER TABLE "follow_ups" ADD COLUMN "superseded_at"    TIMESTAMP(3);
ALTER TABLE "follow_ups" ADD COLUMN "superseded_by_id" TEXT;
ALTER TABLE "follow_ups" ADD COLUMN "closed_reason"    TEXT;

-- 3. Lifecycle indexes (schema-managed)
CREATE INDEX "follow_ups_lead_id_status_idx" ON "follow_ups"("lead_id", "status");
CREATE INDEX "follow_ups_status_scheduled_at_assigned_to_id_idx" ON "follow_ups"("status", "scheduled_at", "assigned_to_id");

-- ─────────────────────────────────────────────
-- 4. Backfill existing data (BEFORE the partial unique index, so duplicates collapse first)
-- ─────────────────────────────────────────────

-- 4a. Anything already completed → Completed.
UPDATE "follow_ups"
SET "status" = 'Completed'
WHERE "completed_at" IS NOT NULL;

-- 4b. Per lead with >1 remaining Active row: keep the most-recently-created as Active,
--     supersede the rest (pointing at the survivor).
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER()  OVER (PARTITION BY "lead_id" ORDER BY "created_at" DESC, "id" DESC) AS rn,
    FIRST_VALUE("id") OVER (PARTITION BY "lead_id" ORDER BY "created_at" DESC, "id" DESC) AS survivor_id
  FROM "follow_ups"
  WHERE "status" = 'Active' AND "lead_id" IS NOT NULL
)
UPDATE "follow_ups" f
SET "status"           = 'Superseded',
    "superseded_at"    = now(),
    "superseded_by_id" = r.survivor_id,
    "closed_reason"    = 'Backfill: duplicate active follow-up'
FROM ranked r
WHERE f."id" = r."id" AND r.rn > 1;

-- 4c. Leads in a no-follow-up status → cancel any remaining Active row.
UPDATE "follow_ups" f
SET "status"        = 'Cancelled',
    "closed_reason" = 'Backfill: lead in ' || l."status"::text
FROM "leads" l
WHERE f."lead_id" = l."id"
  AND f."status" = 'Active'
  AND l."status" IN ('Lost', 'Won', 'InvalidLead', 'OnHold', 'Recycle');

-- 4d. Re-sync the lead mirror from each lead's surviving Active row …
UPDATE "leads" l
SET "next_followup_date" = fa."scheduled_at",
    "followup_type"      = fa."type"
FROM (
  SELECT DISTINCT ON ("lead_id") "lead_id", "scheduled_at", "type"
  FROM "follow_ups"
  WHERE "status" = 'Active' AND "lead_id" IS NOT NULL
  ORDER BY "lead_id", "created_at" DESC, "id" DESC
) fa
WHERE l."id" = fa."lead_id"
  AND (l."next_followup_date" IS DISTINCT FROM fa."scheduled_at"
       OR l."followup_type" IS DISTINCT FROM fa."type");

-- 4e. … and null it for leads with no Active row.
UPDATE "leads" l
SET "next_followup_date" = NULL,
    "followup_type"      = NULL
WHERE NOT EXISTS (
    SELECT 1 FROM "follow_ups" f WHERE f."lead_id" = l."id" AND f."status" = 'Active'
  )
  AND (l."next_followup_date" IS NOT NULL OR l."followup_type" IS NOT NULL);

-- 5. Database-level guarantee: at most one Active follow-up per lead.
CREATE UNIQUE INDEX "follow_ups_one_active_per_lead"
  ON "follow_ups" ("lead_id")
  WHERE "status" = 'Active' AND "lead_id" IS NOT NULL;

-- 6. Backfill summary (visible in migrate output).
DO $$
DECLARE
  v_superseded INT;
  v_cancelled  INT;
  v_active     INT;
  v_leads_null INT;
BEGIN
  SELECT count(*) INTO v_superseded FROM "follow_ups" WHERE "closed_reason" = 'Backfill: duplicate active follow-up';
  SELECT count(*) INTO v_cancelled  FROM "follow_ups" WHERE "closed_reason" LIKE 'Backfill: lead in %';
  SELECT count(*) INTO v_active     FROM "follow_ups" WHERE "status" = 'Active';
  SELECT count(*) INTO v_leads_null FROM "leads" WHERE "next_followup_date" IS NULL AND "deleted_at" IS NULL;
  RAISE NOTICE 'Fix#3 backfill: % rows superseded (duplicates), % rows cancelled (no-followup status), % active follow-ups remain, % live leads with null next_followup_date',
    v_superseded, v_cancelled, v_active, v_leads_null;
END $$;
