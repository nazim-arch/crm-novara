-- Add missing columns to leads
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "potential_lead_value" DECIMAL(12,2);

-- Add missing columns to opportunities
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "unit_value" DECIMAL(12,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "number_of_units" INTEGER;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "total_sales_value" DECIMAL(12,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "commission_percent" DECIMAL(8,4);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "possible_revenue" DECIMAL(12,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "opportunity_source" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "closed_revenue" DECIMAL(12,2);

-- Create opportunity_expenses table if it doesn't exist
CREATE TABLE IF NOT EXISTS "opportunity_expenses" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "added_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_expenses_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys for opportunity_expenses (only if table was just created)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'opportunity_expenses_opportunity_id_fkey'
    ) THEN
        ALTER TABLE "opportunity_expenses" ADD CONSTRAINT "opportunity_expenses_opportunity_id_fkey"
            FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'opportunity_expenses_added_by_id_fkey'
    ) THEN
        ALTER TABLE "opportunity_expenses" ADD CONSTRAINT "opportunity_expenses_added_by_id_fkey"
            FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Create index on opportunity_expenses
CREATE INDEX IF NOT EXISTS "opportunity_expenses_opportunity_id_idx" ON "opportunity_expenses"("opportunity_id");
