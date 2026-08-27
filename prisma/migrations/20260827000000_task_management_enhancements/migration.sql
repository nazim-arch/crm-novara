-- Task Management Enhancements (2026-08-27)
-- 1. Recurrence hardening fields on tasks
-- 2. TaskTemplate model (reusable presets)
-- 3. TaskEscalated notification type

-- ── 1. Recurrence fields ──────────────────────────────────────────────────────
ALTER TABLE "tasks" ADD COLUMN "recurrence_interval"   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tasks" ADD COLUMN "recurrence_end_date"   TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "recurrence_spawned_at" TIMESTAMP(3);

-- Recurrence sweep lookup: overdue, un-spawned recurring tasks
CREATE INDEX "tasks_recurrence_recurrence_spawned_at_due_date_idx"
  ON "tasks"("recurrence", "recurrence_spawned_at", "due_date");

-- ── 2. TaskEscalated notification type ────────────────────────────────────────
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TaskEscalated';

-- ── 3. TaskTemplate ───────────────────────────────────────────────────────────
CREATE TABLE "task_templates" (
  "id"                  TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "description"         TEXT,
  "priority"            "TaskPriority" NOT NULL DEFAULT 'Medium',
  "sector"              TEXT,
  "checklist"           JSONB,
  "due_in_days"         INTEGER,
  "recurrence"          "RecurrenceType" NOT NULL DEFAULT 'None',
  "recurrence_interval" INTEGER NOT NULL DEFAULT 1,
  "revenue_tagged"      BOOLEAN NOT NULL DEFAULT false,
  "revenue_amount"      DECIMAL(12,2),
  "default_assignee_id" TEXT,
  "client_id"           TEXT,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "created_by_id"       TEXT NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_templates_is_active_idx" ON "task_templates"("is_active");

ALTER TABLE "task_templates"
  ADD CONSTRAINT "task_templates_default_assignee_id_fkey"
  FOREIGN KEY ("default_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_templates"
  ADD CONSTRAINT "task_templates_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_templates"
  ADD CONSTRAINT "task_templates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
