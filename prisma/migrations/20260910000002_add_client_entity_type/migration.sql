-- Add "Client" to the EntityType enum so client imports (and any future client
-- audit) can write Activity rows keyed to entity_type = 'Client', consistent with
-- Lead/Opportunity/Task. Matches the repo's existing ADD VALUE pattern.
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'Client';
