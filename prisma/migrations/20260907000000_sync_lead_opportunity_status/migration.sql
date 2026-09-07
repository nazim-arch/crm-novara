-- Keep Lead.status and every LeadOpportunity link's status in lockstep, in BOTH directions,
-- for any write from anywhere (routes, bulk updates, imports, MCP, scripts, future code).
--
-- Because a Lead has a single status column, "always equal both ways" means a change to any one
-- of a lead's opportunity links propagates to the lead and therefore to all its other links — a
-- lead ends up at one stage across its opportunities. This is intentional (founder decision).
--
-- Recursion is bounded: each mirror UPDATE is guarded with `status IS DISTINCT FROM <new>`, so once
-- the values match, no rows change and no further trigger fires.

-- ── Lead.status change → mirror to all its opportunity links ──────────────────
CREATE OR REPLACE FUNCTION sync_lead_status_to_links() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE lead_opportunities
       SET status = NEW.status
     WHERE lead_id = NEW.id
       AND status IS DISTINCT FROM NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_lead_status_to_links ON leads;
CREATE TRIGGER trg_sync_lead_status_to_links
  AFTER UPDATE OF status ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_status_to_links();

-- ── LeadOpportunity.status change → mirror to the parent lead (which then mirrors to siblings) ──
CREATE OR REPLACE FUNCTION sync_link_status_to_lead() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE leads
       SET status = NEW.status
     WHERE id = NEW.lead_id
       AND status IS DISTINCT FROM NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_link_status_to_lead ON lead_opportunities;
CREATE TRIGGER trg_sync_link_status_to_lead
  AFTER UPDATE OF status ON lead_opportunities
  FOR EACH ROW EXECUTE FUNCTION sync_link_status_to_lead();

-- ── New link inherits the lead's current stage, so it's consistent from creation ──
CREATE OR REPLACE FUNCTION set_new_link_status_from_lead() RETURNS trigger AS $$
DECLARE
  lead_status "LeadStatus";
BEGIN
  SELECT status INTO lead_status FROM leads WHERE id = NEW.lead_id;
  IF lead_status IS NOT NULL THEN
    NEW.status := lead_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_new_link_status_from_lead ON lead_opportunities;
CREATE TRIGGER trg_set_new_link_status_from_lead
  BEFORE INSERT ON lead_opportunities
  FOR EACH ROW EXECUTE FUNCTION set_new_link_status_from_lead();

-- ── One-time reconciliation of existing divergence: links adopt their lead's status ──
-- (Lead.status has been the more consistently-updated field, so it is the source of truth here.
--  This also fixes leads whose link stayed behind — e.g. Focus-Queue Wons.)
UPDATE lead_opportunities lo
   SET status = l.status
  FROM leads l
 WHERE lo.lead_id = l.id
   AND lo.status IS DISTINCT FROM l.status;
