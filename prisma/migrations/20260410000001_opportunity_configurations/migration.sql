-- Migration: Opportunity module redesign
-- Adds OpportunityConfiguration table, simplifies Opportunity model

-- 1. Create opportunity_configurations table
CREATE TABLE "opportunity_configurations" (
  "id" TEXT NOT NULL,
  "opportunity_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "number_of_units" INTEGER NOT NULL,
  "price_per_unit" DECIMAL(12,2) NOT NULL,
  "row_total" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "opportunity_configurations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "opportunity_configurations_opportunity_id_idx"
  ON "opportunity_configurations"("opportunity_id");

ALTER TABLE "opportunity_configurations"
  ADD CONSTRAINT "opportunity_configurations_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Migrate commission data: fill commission_percent from commission_value for Percentage type
UPDATE "opportunities"
SET commission_percent = commission_value
WHERE commission_type::text = 'Percentage' AND commission_percent IS NULL;

-- For Fixed-type records with no percent set, default to 2%
UPDATE "opportunities"
SET commission_percent = 2.0
WHERE commission_percent IS NULL;

-- 3. Make commission_percent NOT NULL
ALTER TABLE "opportunities"
  ALTER COLUMN "commission_percent" SET NOT NULL,
  ALTER COLUMN "commission_percent" SET DEFAULT 2.0;

-- 4. Widen financial columns to DECIMAL(14,2)
ALTER TABLE "opportunities"
  ALTER COLUMN "total_sales_value" TYPE DECIMAL(14,2),
  ALTER COLUMN "possible_revenue" TYPE DECIMAL(14,2);

-- Add closed_revenue if it doesn't exist (idempotent)
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "closed_revenue" DECIMAL(14,2);

-- 5. Drop obsolete columns
ALTER TABLE "opportunities"
  DROP COLUMN IF EXISTS "sector",
  DROP COLUMN IF EXISTS "price_min",
  DROP COLUMN IF EXISTS "price_max",
  DROP COLUMN IF EXISTS "commission_type",
  DROP COLUMN IF EXISTS "commission_value",
  DROP COLUMN IF EXISTS "unit_types",
  DROP COLUMN IF EXISTS "unit_value",
  DROP COLUMN IF EXISTS "number_of_units",
  DROP COLUMN IF EXISTS "opportunity_source";

-- 6. Drop CommissionType enum (no longer used)
DROP TYPE IF EXISTS "CommissionType";
