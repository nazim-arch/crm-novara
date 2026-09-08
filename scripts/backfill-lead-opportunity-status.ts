/**
 * Backfill script: populate new per-opportunity pipeline fields on existing LeadOpportunity records.
 * Copies status, activity_stage, potential_lead_value, lost_reason/notes from the parent Lead.
 * Run once after the schema migration. (Historical — completed.)
 *
 * NOTE: settlement_value / deal_commission_percent are no longer mirrored onto LeadOpportunity —
 * a Won deal's money now lives on the Lead + its DealClosure (Fix #4). Those fields were dropped.
 *
 * Usage: node -e "require('dotenv').config({path:'.env.local'})" && npx tsx scripts/backfill-lead-opportunity-status.ts
 * Or set DATABASE_URL in your shell and run: npx tsx scripts/backfill-lead-opportunity-status.ts
 */

// Load env vars manually before any other import
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const links = await prisma.leadOpportunity.findMany({
    include: {
      lead: {
        select: {
          status: true,
          activity_stage: true,
          potential_lead_value: true,
          lost_reason: true,
          lost_notes: true,
        },
      },
    },
  });

  console.log(`Found ${links.length} LeadOpportunity records to backfill.`);
  let updated = 0;

  for (const link of links) {
    await prisma.leadOpportunity.update({
      where: { id: link.id },
      data: {
        status: link.lead.status,
        activity_stage: link.lead.activity_stage,
        potential_lead_value: link.lead.potential_lead_value,
        lost_reason: link.lead.lost_reason ?? null,
        lost_notes: link.lead.lost_notes ?? null,
      },
    });
    updated++;
  }

  console.log(`Backfilled ${updated} records successfully.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
