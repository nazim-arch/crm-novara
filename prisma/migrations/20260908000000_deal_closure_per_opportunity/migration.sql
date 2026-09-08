-- Re-key active-closure uniqueness from per-lead to per (lead, opportunity).
-- A lead can now be Won on one opportunity and not another, so each Lead+Opportunity
-- combination gets its own closure. Unlinked Won leads (no opportunity) keep one closure each.

DROP INDEX IF EXISTS "deal_closures_lead_id_active_key";

-- At most one active (non-Cancelled) closure per (lead, opportunity).
CREATE UNIQUE INDEX "deal_closures_lead_opp_active_key"
  ON "deal_closures"("lead_id", "opportunity_id")
  WHERE "status" <> 'Cancelled' AND "opportunity_id" IS NOT NULL;

-- At most one active closure for an unlinked Won lead (no opportunity).
CREATE UNIQUE INDEX "deal_closures_lead_unlinked_active_key"
  ON "deal_closures"("lead_id")
  WHERE "status" <> 'Cancelled' AND "opportunity_id" IS NULL;
