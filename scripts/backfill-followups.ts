import { prisma } from "../lib/prisma";
import { getActiveFollowUp, setActiveFollowUp, isNoFollowUpStatus } from "../lib/follow-ups";

async function main() {
  const leads = await prisma.lead.findMany({
    where: { next_followup_date: { not: null }, deleted_at: null },
    select: {
      id: true, lead_number: true,
      status: true,
      next_followup_date: true,
      followup_type: true,
      assigned_to_id: true,
      created_by_id: true,
    },
  });

  console.log(`Found ${leads.length} leads with next_followup_date set`);

  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (isNoFollowUpStatus(lead.status)) {
      skipped++;
      continue;
    }
    const existing = await getActiveFollowUp(lead.id);
    if (existing) {
      skipped++;
      continue;
    }

    await setActiveFollowUp({
      lead_id: lead.id,
      scheduled_at: lead.next_followup_date!,
      type: lead.followup_type ?? "Call",
      assigned_to_id: lead.assigned_to_id,
      created_by_id: lead.created_by_id,
      reason: "Backfill: recreate active follow-up from lead mirror",
    });

    console.log(`  Created FU for ${lead.lead_number} → ${lead.next_followup_date!.toISOString().slice(0, 10)}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already active or no-follow-up status)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
