-- Add 'Booked' pipeline stage to LeadStatus enum, positioned before 'Won'.
-- Booked = client has paid a booking advance but still needs to complete legal
-- or financial steps before final settlement. Becomes Won only on settlement.
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Booked' BEFORE 'Won';
