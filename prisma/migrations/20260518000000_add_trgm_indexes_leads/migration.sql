-- Enable pg_trgm extension (required for GIN trigram indexes and similarity())
-- No-op if already enabled; safe to run multiple times.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on leads.full_name
-- Picked up automatically by the Postgres planner for ILIKE '%term%' queries.
-- NOTE: CONCURRENTLY cannot run inside a transaction (which Prisma migrations use).
-- For a large production table, run the CONCURRENTLY version manually outside this
-- migration: CREATE INDEX CONCURRENTLY IF NOT EXISTS ... (then mark migration applied).
CREATE INDEX IF NOT EXISTS "leads_full_name_trgm_idx"
  ON "leads" USING GIN (full_name gin_trgm_ops);

-- GIN trigram index on leads.email
CREATE INDEX IF NOT EXISTS "leads_email_trgm_idx"
  ON "leads" USING GIN (email gin_trgm_ops);
