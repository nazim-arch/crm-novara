import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Finding stale LeadOpportunity records...\n");

  const stale = await prisma.leadOpportunity.findMany({
    where: {
      status:         "New",
      activity_stage: "New",
      lead: {
        deleted_at: null,
        OR: [
          { status:         { not: "New" } },
          { activity_stage: { not: "New" } },
        ],
      },
    },
    include: {
      lead: { select: { lead_number: true, status: true, activity_stage: true } },
      opportunity: { select: { opp_number: true } },
    },
    orderBy: { lead: { lead_number: "asc" } },
  });

  if (stale.length === 0) {
    console.log("Nothing to fix — all stages are already in sync.");
    return;
  }

  console.log(`Found ${stale.length} record(s) to fix:\n`);
  for (const lo of stale) {
    console.log(`  ${lo.lead.lead_number} / ${lo.opportunity.opp_number}  →  status: ${lo.status} → ${lo.lead.status}  |  activity: ${lo.activity_stage} → ${lo.lead.activity_stage}`);
  }

  console.log("\nApplying fixes (one by one — no transaction needed, idempotent)...\n");

  let fixed = 0;
  for (const lo of stale) {
    await prisma.leadOpportunity.update({
      where: { id: lo.id },
      data: {
        status:         lo.lead.status,
        activity_stage: lo.lead.activity_stage ?? "New",
      },
    });
    fixed++;
    if (fixed % 25 === 0) console.log(`  ${fixed} / ${stale.length} done...`);
  }

  console.log(`\nDone. Fixed ${stale.length} record(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
