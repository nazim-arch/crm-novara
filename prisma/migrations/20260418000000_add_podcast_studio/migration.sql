-- CreateEnum
CREATE TYPE "PodcastBookingStatus" AS ENUM ('Confirmed', 'Cancelled', 'Completed');

-- CreateTable
CREATE TABLE "podcast_studio_bookings" (
    "id" TEXT NOT NULL,
    "booking_date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "client_name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "recording_hours" DECIMAL(8,2),
    "recording_value" DECIMAL(12,2),
    "editing_hours" DECIMAL(8,2),
    "editing_value" DECIMAL(12,2),
    "gst_percent" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PodcastBookingStatus" NOT NULL DEFAULT 'Confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "podcast_studio_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "podcast_studio_bookings_booking_date_idx" ON "podcast_studio_bookings"("booking_date");

-- CreateIndex
CREATE INDEX "podcast_studio_bookings_status_idx" ON "podcast_studio_bookings"("status");

-- CreateIndex
CREATE INDEX "podcast_studio_bookings_client_name_idx" ON "podcast_studio_bookings"("client_name");
