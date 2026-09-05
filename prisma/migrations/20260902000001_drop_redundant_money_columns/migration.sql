-- Fix #4 cleanup: drop redundant money columns now that DealClosure is the single source of truth.
--
--  * lead_opportunities.settlement_value / deal_commission_percent were only ever mirrors of the
--    Lead-level fields; nothing reads them anymore (reports + lead detail now read DealClosure).
--  * leads.commission_estimate was display-only and never written by any code path.
--
-- The authoritative estimate remains on leads.settlement_value / leads.deal_commission_percent
-- (kept), which also seeds each DealClosure's frozen planned baseline — so no history is lost.

-- AlterTable
ALTER TABLE "lead_opportunities" DROP COLUMN "deal_commission_percent",
DROP COLUMN "settlement_value";

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "commission_estimate";
