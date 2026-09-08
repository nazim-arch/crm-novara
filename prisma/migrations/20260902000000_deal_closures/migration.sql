-- CreateEnum
CREATE TYPE "DealClosureStatus" AS ENUM ('Pending', 'Reconciled', 'Cancelled');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'DealClosure';

-- CreateTable
CREATE TABLE "deal_closures" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "planned_settlement_value" DECIMAL(14,2) NOT NULL,
    "planned_commission_percent" DECIMAL(8,4) NOT NULL,
    "planned_commission_amount" DECIMAL(14,2) NOT NULL,
    "planned_by_id" TEXT NOT NULL,
    "planned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "won_year" INTEGER NOT NULL,
    "won_month" INTEGER NOT NULL,
    "actual_settlement_value" DECIMAL(14,2),
    "settlement_variance" DECIMAL(14,2),
    "settlement_variance_pct" DECIMAL(8,4),
    "status" "DealClosureStatus" NOT NULL DEFAULT 'Pending',
    "reconciled_by_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_closure_agent_shares" (
    "id" TEXT NOT NULL,
    "deal_closure_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "role" TEXT,
    "planned_commission_amount" DECIMAL(14,2),
    "actual_commission_amount" DECIMAL(14,2),
    "incentive_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commission_variance" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_closure_agent_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_closures_lead_id_idx" ON "deal_closures"("lead_id");

-- CreateIndex
CREATE INDEX "deal_closures_opportunity_id_idx" ON "deal_closures"("opportunity_id");

-- CreateIndex
CREATE INDEX "deal_closures_status_idx" ON "deal_closures"("status");

-- CreateIndex
CREATE INDEX "deal_closures_won_year_won_month_idx" ON "deal_closures"("won_year", "won_month");

-- CreateIndex
CREATE INDEX "deal_closure_agent_shares_agent_id_idx" ON "deal_closure_agent_shares"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_closure_agent_shares_deal_closure_id_agent_id_key" ON "deal_closure_agent_shares"("deal_closure_id", "agent_id");

-- CreateIndex
-- Partial unique index (Prisma cannot express this in-schema): at most ONE active
-- (non-Cancelled) closure per lead. A Cancelled closure is kept for history and does
-- NOT block a later re-Won closure for the same lead.
CREATE UNIQUE INDEX "deal_closures_lead_id_active_key" ON "deal_closures"("lead_id") WHERE "status" <> 'Cancelled';

-- AddForeignKey
ALTER TABLE "deal_closures" ADD CONSTRAINT "deal_closures_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_closures" ADD CONSTRAINT "deal_closures_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_closures" ADD CONSTRAINT "deal_closures_planned_by_id_fkey" FOREIGN KEY ("planned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_closures" ADD CONSTRAINT "deal_closures_reconciled_by_id_fkey" FOREIGN KEY ("reconciled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_closure_agent_shares" ADD CONSTRAINT "deal_closure_agent_shares_deal_closure_id_fkey" FOREIGN KEY ("deal_closure_id") REFERENCES "deal_closures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_closure_agent_shares" ADD CONSTRAINT "deal_closure_agent_shares_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
