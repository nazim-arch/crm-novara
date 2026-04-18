-- Add booking_type and seater_type to existing bookings table
ALTER TABLE "podcast_studio_bookings"
  ADD COLUMN "booking_type" TEXT NOT NULL DEFAULT 'One-time',
  ADD COLUMN "seater_type"  TEXT;

-- Create per-seater rates table
CREATE TABLE "podcast_studio_rates" (
    "id"                       TEXT NOT NULL,
    "seater_type"              TEXT NOT NULL,
    "recording_rate_per_hour"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "editing_rate_per_hour"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "podcast_studio_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "podcast_studio_rates_seater_type_key"
  ON "podcast_studio_rates"("seater_type");

-- Seed default rows (rates default to 0 — admin sets real values in Studio Settings)
INSERT INTO "podcast_studio_rates" ("id", "seater_type", "recording_rate_per_hour", "editing_rate_per_hour", "updated_at")
VALUES
  (gen_random_uuid()::text, '1-Seater', 0, 0, NOW()),
  (gen_random_uuid()::text, '2-Seater', 0, 0, NOW()),
  (gen_random_uuid()::text, '3-Seater', 0, 0, NOW()),
  (gen_random_uuid()::text, '4-Seater', 0, 0, NOW());
