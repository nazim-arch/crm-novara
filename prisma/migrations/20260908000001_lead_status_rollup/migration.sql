-- Lead.status becomes a derived ROLLUP of its LeadOpportunity links: the best/furthest stage.
-- Status is owned per Lead+Opportunity link; the lead-level column is a convenience rollup used by
-- lead-level lists/filters. Enforced by a trigger so it holds for every write from anywhere.
-- One-directional (links -> lead): no recursion, since nothing writes links back from a lead update.
-- Unlinked leads (no links) keep whatever the app set directly.

-- Lower number = better/furthest outcome. A Won on any opportunity makes the lead show Won.
CREATE OR REPLACE FUNCTION lead_status_priority(s "LeadStatus") RETURNS int AS $$
  SELECT CASE s
    WHEN 'Won'                THEN 1
    WHEN 'Booked'             THEN 2
    WHEN 'Negotiation'        THEN 3
    WHEN 'SiteVisitCompleted' THEN 4
    WHEN 'Prospect'           THEN 5
    WHEN 'Contacted'          THEN 6
    WHEN 'New'                THEN 7
    WHEN 'OnHold'             THEN 8
    WHEN 'Recycle'            THEN 9
    WHEN 'Lost'               THEN 10
    WHEN 'InvalidLead'        THEN 11
    ELSE 99
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION recompute_lead_status_from_links() RETURNS trigger AS $$
DECLARE
  target_lead text;
  best "LeadStatus";
BEGIN
  target_lead := COALESCE(NEW.lead_id, OLD.lead_id);
  SELECT lo.status INTO best
    FROM lead_opportunities lo
   WHERE lo.lead_id = target_lead
   ORDER BY lead_status_priority(lo.status) ASC
   LIMIT 1;
  IF best IS NOT NULL THEN
    UPDATE leads SET status = best WHERE id = target_lead AND status IS DISTINCT FROM best;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rollup_lead_status_ins ON lead_opportunities;
CREATE TRIGGER trg_rollup_lead_status_ins
  AFTER INSERT ON lead_opportunities
  FOR EACH ROW EXECUTE FUNCTION recompute_lead_status_from_links();

DROP TRIGGER IF EXISTS trg_rollup_lead_status_upd ON lead_opportunities;
CREATE TRIGGER trg_rollup_lead_status_upd
  AFTER UPDATE OF status ON lead_opportunities
  FOR EACH ROW EXECUTE FUNCTION recompute_lead_status_from_links();

DROP TRIGGER IF EXISTS trg_rollup_lead_status_del ON lead_opportunities;
CREATE TRIGGER trg_rollup_lead_status_del
  AFTER DELETE ON lead_opportunities
  FOR EACH ROW EXECUTE FUNCTION recompute_lead_status_from_links();

-- One-time reconcile: every linked lead's status = its rollup.
UPDATE leads l
   SET status = sub.best
  FROM (
    SELECT lo.lead_id,
           (ARRAY_AGG(lo.status ORDER BY lead_status_priority(lo.status) ASC))[1] AS best
      FROM lead_opportunities lo
     GROUP BY lo.lead_id
  ) sub
 WHERE l.id = sub.lead_id
   AND l.status IS DISTINCT FROM sub.best;
