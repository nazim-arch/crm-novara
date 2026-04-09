-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'Manager', 'Sales', 'Operations', 'Viewer');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('Hot', 'Warm', 'Cold', 'FollowUpLater');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('New', 'Contacted', 'Qualified', 'Requirement', 'OpportunityTagged', 'Visit', 'FollowUp', 'Negotiation', 'Won', 'Lost', 'OnHold', 'Recycle');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('Residential', 'Commercial', 'Plot', 'Villa', 'Apartment', 'Office');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('EndUse', 'Investment');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('Fixed', 'Percentage');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('Active', 'Inactive', 'Sold');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('Low', 'Medium', 'High', 'Critical');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('Todo', 'InProgress', 'Done', 'Cancelled');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('None', 'Daily', 'Weekly', 'Monthly');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('Budget', 'Location', 'Configuration', 'Timing', 'NotSerious', 'Financing', 'PurchasedElsewhere', 'Other');

-- CreateEnum
CREATE TYPE "FollowUpType" AS ENUM ('Call', 'Email', 'WhatsApp', 'Visit', 'Meeting');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('Lead', 'Opportunity', 'Task', 'User');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LeadAssigned', 'TaskAssigned', 'FollowUpDue', 'FollowUpOverdue', 'TaskOverdue', 'HotLeadStale', 'StageChanged', 'NoteAdded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'Sales',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "avatar_url" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "lead_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "lead_source" TEXT NOT NULL,
    "temperature" "LeadTemperature" NOT NULL DEFAULT 'Cold',
    "status" "LeadStatus" NOT NULL DEFAULT 'New',
    "campaign_source" TEXT,
    "referral_source" TEXT,
    "budget_min" DECIMAL(12,2),
    "budget_max" DECIMAL(12,2),
    "property_type" "PropertyType",
    "unit_type" TEXT,
    "location_preference" TEXT,
    "timeline_to_buy" TEXT,
    "purpose" "Purpose",
    "first_contact_date" TIMESTAMP(3),
    "last_contact_date" TIMESTAMP(3),
    "next_followup_date" TIMESTAMP(3),
    "followup_type" "FollowUpType",
    "outcome" TEXT,
    "reason_for_interest" TEXT,
    "visit_status" TEXT,
    "negotiation_status" TEXT,
    "closing_probability" INTEGER,
    "deal_value" DECIMAL(12,2),
    "commission_estimate" DECIMAL(12,2),
    "reason_not_interested" TEXT,
    "alternate_requirement" TEXT,
    "lost_reason" "LostReason",
    "lost_notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,
    "lead_owner_id" TEXT NOT NULL,
    "assigned_to_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "opp_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "sector" TEXT,
    "developer" TEXT,
    "property_type" "PropertyType" NOT NULL,
    "unit_types" TEXT[],
    "location" TEXT NOT NULL,
    "price_min" DECIMAL(12,2),
    "price_max" DECIMAL(12,2),
    "commission_type" "CommissionType" NOT NULL DEFAULT 'Percentage',
    "commission_value" DECIMAL(8,4) NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_opportunities" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "tagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tagged_by_id" TEXT NOT NULL,
    "smart_match_score" INTEGER,
    "notes" TEXT,

    CONSTRAINT "lead_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "task_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'Medium',
    "status" "TaskStatus" NOT NULL DEFAULT 'Todo',
    "due_date" TIMESTAMP(3) NOT NULL,
    "start_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "sector" TEXT,
    "revenue_tagged" BOOLEAN NOT NULL DEFAULT false,
    "revenue_amount" DECIMAL(12,2),
    "notes" TEXT,
    "checklist" JSONB,
    "recurrence" "RecurrenceType" NOT NULL DEFAULT 'None',
    "deleted_at" TIMESTAMP(3),
    "assigned_to_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage" "LeadStatus",
    "to_stage" "LeadStatus" NOT NULL,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" "EntityType",
    "entity_id" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "outcome" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_counters" (
    "entity" TEXT NOT NULL,
    "last_val" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("entity")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_number_key" ON "leads"("lead_number");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_temperature_idx" ON "leads"("temperature");

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_idx" ON "leads"("assigned_to_id");

-- CreateIndex
CREATE INDEX "leads_next_followup_date_idx" ON "leads"("next_followup_date");

-- CreateIndex
CREATE INDEX "leads_deleted_at_idx" ON "leads"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_opp_number_key" ON "opportunities"("opp_number");

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

-- CreateIndex
CREATE INDEX "opportunities_property_type_idx" ON "opportunities"("property_type");

-- CreateIndex
CREATE UNIQUE INDEX "lead_opportunities_lead_id_opportunity_id_key" ON "lead_opportunities"("lead_id", "opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_task_number_key" ON "tasks"("task_number");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_id_idx" ON "tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_lead_id_idx" ON "tasks"("lead_id");

-- CreateIndex
CREATE INDEX "tasks_opportunity_id_idx" ON "tasks"("opportunity_id");

-- CreateIndex
CREATE INDEX "tasks_deleted_at_idx" ON "tasks"("deleted_at");

-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_idx" ON "lead_stage_history"("lead_id");

-- CreateIndex
CREATE INDEX "activities_entity_type_entity_id_idx" ON "activities"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activities_created_at_idx" ON "activities"("created_at");

-- CreateIndex
CREATE INDEX "notes_entity_type_entity_id_idx" ON "notes"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "follow_ups_lead_id_idx" ON "follow_ups"("lead_id");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_at_idx" ON "follow_ups"("scheduled_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_owner_id_fkey" FOREIGN KEY ("lead_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_tagged_by_id_fkey" FOREIGN KEY ("tagged_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activity_lead_fk" FOREIGN KEY ("entity_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activity_opp_fk" FOREIGN KEY ("entity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activity_task_fk" FOREIGN KEY ("entity_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "note_lead_fk" FOREIGN KEY ("entity_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "note_opp_fk" FOREIGN KEY ("entity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "note_task_fk" FOREIGN KEY ("entity_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_lead_fk" FOREIGN KEY ("entity_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachment_opp_fk" FOREIGN KEY ("entity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
