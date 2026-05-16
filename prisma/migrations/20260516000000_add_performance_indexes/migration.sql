-- Performance indexes: hot query paths identified in audit (2026-05-16)

-- Lead: default sort column (updated_at DESC used on every list page load)
CREATE INDEX "leads_updated_at_idx" ON "leads"("updated_at");

-- Lead: dashboard range filters (created_at BETWEEN rangeStart AND rangeEnd)
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- Lead: FK used in owner-scoped reports and queries
CREATE INDEX "leads_lead_owner_id_idx" ON "leads"("lead_owner_id");

-- Lead: used in dashboard groupBy source distribution
CREATE INDEX "leads_lead_source_idx" ON "leads"("lead_source");

-- LeadOpportunity: opportunity_id lookup for batch revenue recalculation
-- The existing @@unique([lead_id, opportunity_id]) covers lead_id (leftmost prefix)
-- but cannot serve WHERE opportunity_id IN (...) efficiently.
CREATE INDEX "lead_opportunities_opportunity_id_idx" ON "lead_opportunities"("opportunity_id");

-- Opportunity: every opportunity query filters by deleted_at IS NULL
CREATE INDEX "opportunities_deleted_at_idx" ON "opportunities"("deleted_at");

-- Opportunity: default sort column on the opportunities list
CREATE INDEX "opportunities_created_at_idx" ON "opportunities"("created_at");
