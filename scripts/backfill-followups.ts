import { prisma } from "../lib/prisma";

async function main() {
  const leads = await prisma.lead.findMany({
    where: { next_followup_date: { not: null }, deleted_at: null },
    select: {
      id: true, lead_number: true,
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
    const existing = await prisma.followUp.findFirst({
      where: { lead_id: lead.id, completed_at: null },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.followUp.create({
      data: {
        lead_id: lead.id,
        assigned_to_id: lead.assigned_to_id,
        type: (lead.followup_type ?? "Call") as "Call",
        scheduled_at: lead.next_followup_date!,
        created_by_id: lead.created_by_id,
      },
    });

    console.log(`  Created FU for ${lead.lead_number} → ${lead.next_followup_date!.toISOString().slice(0, 10)}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} already had a pending FU`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
