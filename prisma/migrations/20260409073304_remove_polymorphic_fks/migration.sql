-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activity_lead_fk";

-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activity_opp_fk";

-- DropForeignKey
ALTER TABLE "activities" DROP CONSTRAINT "activity_task_fk";

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_lead_fk";

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachment_opp_fk";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "note_lead_fk";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "note_opp_fk";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "note_task_fk";
