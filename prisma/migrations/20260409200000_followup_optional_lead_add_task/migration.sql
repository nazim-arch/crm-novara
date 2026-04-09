-- Make lead_id optional on follow_ups
ALTER TABLE "follow_ups" ALTER COLUMN "lead_id" DROP NOT NULL;

-- Add task_id column
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "task_id" TEXT;

-- Add foreign key constraint for task_id
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for task_id
CREATE INDEX IF NOT EXISTS "follow_ups_task_id_idx" ON "follow_ups"("task_id");
