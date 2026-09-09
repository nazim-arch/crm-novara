-- Fix #5 (Lead Visibility) schema:
--  * LeadOpportunity soft-untag columns (links are hidden, never hard-deleted).
--  * DealClosure.opportunity_id FK hardened from the default SetNull to Restrict, so an opportunity
--    that anchors a closure cannot be deleted out from under it (§5.2).

-- DropForeignKey
ALTER TABLE "deal_closures" DROP CONSTRAINT "deal_closures_opportunity_id_fkey";

-- AlterTable
ALTER TABLE "lead_opportunities" ADD COLUMN     "untagged_at" TIMESTAMP(3),
ADD COLUMN     "untagged_by_id" TEXT;

-- CreateIndex
CREATE INDEX "lead_opportunities_untagged_at_idx" ON "lead_opportunities"("untagged_at");

-- AddForeignKey
ALTER TABLE "deal_closures" ADD CONSTRAINT "deal_closures_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
