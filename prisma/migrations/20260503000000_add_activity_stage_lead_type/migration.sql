-- Add new LeadStatus enum values (cannot drop old ones in Postgres, but they won't be used)
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Prospect';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'SiteVisitCompleted';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'InvalidLead';

-- Migrate existing lead data to new stage names
UPDATE "leads" SET status = 'Prospect' WHERE status = 'Qualified';
UPDATE "leads" SET status = 'SiteVisitCompleted' WHERE status = 'Visit';
UPDATE "leads" SET status = 'OnHold' WHERE status = 'FollowUp';

-- Migrate stage history
UPDATE "lead_stage_history" SET to_stage = 'Prospect' WHERE to_stage = 'Qualified';
UPDATE "lead_stage_history" SET from_stage = 'Prospect' WHERE from_stage = 'Qualified';
UPDATE "lead_stage_history" SET to_stage = 'SiteVisitCompleted' WHERE to_stage = 'Visit';
UPDATE "lead_stage_history" SET from_stage = 'SiteVisitCompleted' WHERE from_stage = 'Visit';
UPDATE "lead_stage_history" SET to_stage = 'OnHold' WHERE to_stage = 'FollowUp';
UPDATE "lead_stage_history" SET from_stage = 'OnHold' WHERE from_stage = 'FollowUp';

-- Create ActivityStage enum
CREATE TYPE "ActivityStage" AS ENUM ('New', 'NoResponse', 'Busy', 'Unreachable', 'Prospect', 'CallBack', 'NotInterested', 'Junk');

-- Create LeadType enum
CREATE TYPE "LeadType" AS ENUM ('EndUser', 'Broker', 'ChannelPartner', 'Others');

-- Add new columns to leads table
ALTER TABLE "leads" ADD COLUMN "activity_stage" "ActivityStage" NOT NULL DEFAULT 'New';
ALTER TABLE "leads" ADD COLUMN "lead_type" "LeadType";
