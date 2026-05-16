-- Follow-up Focus Queue fields (2026-05-16)

ALTER TABLE "follow_ups" ADD COLUMN "callback_at"       TIMESTAMP(3);
ALTER TABLE "follow_ups" ADD COLUMN "attempt_count"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "follow_ups" ADD COLUMN "no_response_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "follow_ups_callback_at_idx" ON "follow_ups"("callback_at");
