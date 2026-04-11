-- Add short_name to users table, populate from first word of name
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "short_name" TEXT NOT NULL DEFAULT '';
UPDATE "users" SET "short_name" = SPLIT_PART("name", ' ', 1) WHERE "short_name" = '';
