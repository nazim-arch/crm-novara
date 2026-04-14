-- Deduplication: prevent same profile+platform appearing twice in a campaign
-- NULL profileHandle values are intentionally excluded (NULLs are never equal in PG)
CREATE UNIQUE INDEX "ir_lead_profileHandle_sourcePlatform_campaignId_key"
  ON "ir_lead" ("profileHandle", "sourcePlatform", "campaignId")
  WHERE "profileHandle" IS NOT NULL;
