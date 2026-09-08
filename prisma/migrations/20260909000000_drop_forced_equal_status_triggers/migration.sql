-- Drop the reverted "forced-equal" Lead<->LeadOpportunity status triggers if they linger.
-- They were introduced by 20260907000000_sync_lead_opportunity_status, which was reverted from the
-- repo — but any database that had already applied it still carries these triggers, which force
-- EVERY link to match the lead's status (wrong under the per-opportunity model: marking one
-- opportunity Lost was cascading to all of a lead's opportunities).
--
-- Idempotent: DROP ... IF EXISTS, so this is a no-op on databases that never applied 20260907
-- (e.g. production). Leaves the Fix #5 rollup triggers (trg_rollup_lead_status_*) intact.

DROP TRIGGER IF EXISTS trg_sync_lead_status_to_links ON leads;
DROP TRIGGER IF EXISTS trg_sync_link_status_to_lead ON lead_opportunities;
DROP TRIGGER IF EXISTS trg_set_new_link_status_from_lead ON lead_opportunities;

DROP FUNCTION IF EXISTS sync_lead_status_to_links();
DROP FUNCTION IF EXISTS sync_link_status_to_lead();
DROP FUNCTION IF EXISTS set_new_link_status_from_lead();
