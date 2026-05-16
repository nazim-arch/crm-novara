-- Admin Review Queue: LeadReviewEvent model (2026-05-16)

-- Enums
CREATE TYPE "LeadReviewStatus" AS ENUM ('Pending', 'Reviewed', 'Parked', 'Escalated', 'AskAgent');
CREATE TYPE "LeadReviewQuality" AS ENUM ('Excellent', 'Good', 'Average', 'Poor');
CREATE TYPE "LeadReviewActionType" AS ENUM ('StageChange', 'FollowUpAdded', 'TemperatureChanged', 'AssigneeChanged', 'NoteAdded', 'FieldUpdated');

-- Table
CREATE TABLE "lead_review_events" (
    "id"                TEXT        NOT NULL,
    "lead_id"           TEXT        NOT NULL,
    "opportunity_id"    TEXT,
    "triggered_by_id"   TEXT        NOT NULL,
    "trigger_type"      "LeadReviewActionType" NOT NULL,
    "trigger_context"   JSONB       NOT NULL DEFAULT '{}',
    "review_status"     "LeadReviewStatus" NOT NULL DEFAULT 'Pending',
    "quality_score"     "LeadReviewQuality",
    "review_notes"      TEXT,
    "park_until"        TIMESTAMP(3),
    "escalation_reason" TEXT,
    "actioned_by_id"    TEXT,
    "actioned_at"       TIMESTAMP(3),
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_review_events_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "lead_review_events"
    ADD CONSTRAINT "lead_review_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_review_events"
    ADD CONSTRAINT "lead_review_events_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_review_events"
    ADD CONSTRAINT "lead_review_events_triggered_by_id_fkey"
    FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_review_events"
    ADD CONSTRAINT "lead_review_events_actioned_by_id_fkey"
    FOREIGN KEY ("actioned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "lead_review_events_lead_id_idx"         ON "lead_review_events"("lead_id");
CREATE INDEX "lead_review_events_triggered_by_id_idx" ON "lead_review_events"("triggered_by_id");
CREATE INDEX "lead_review_events_review_status_idx"   ON "lead_review_events"("review_status");
CREATE INDEX "lead_review_events_created_at_idx"      ON "lead_review_events"("created_at");
