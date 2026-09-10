-- Saved custom reports for the report builder (personal, admin-only).
CREATE TABLE "saved_reports" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_reports_owner_id_idx" ON "saved_reports"("owner_id");

ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
