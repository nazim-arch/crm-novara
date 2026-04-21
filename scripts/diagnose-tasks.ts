import { prisma } from "../lib/prisma";

async function main() {
  const total = await prisma.task.count();
  const active = await prisma.task.count({ where: { deleted_at: null } });
  const deleted = await prisma.task.count({ where: { deleted_at: { not: null } } });

  console.log(`\nTask counts:`);
  console.log(`  Total:   ${total}`);
  console.log(`  Active:  ${active}`);
  console.log(`  Deleted: ${deleted}`);

  // Soft-deleted tasks whose LEAD still exists (lead not deleted)
  const deletedButLeadAlive = await prisma.task.count({
    where: {
      deleted_at: { not: null },
      lead_id: { not: null },
      lead: { deleted_at: null },
    },
  });

  // Soft-deleted tasks whose OPPORTUNITY still exists
  const deletedButOppAlive = await prisma.task.count({
    where: {
      deleted_at: { not: null },
      opportunity_id: { not: null },
      opportunity: { deleted_at: null },
    },
  });

  // Soft-deleted standalone tasks (no lead, no opportunity)
  const deletedStandalone = await prisma.task.count({
    where: {
      deleted_at: { not: null },
      lead_id: null,
      opportunity_id: null,
    },
  });

  console.log(`\nOf the ${deleted} deleted tasks:`);
  console.log(`  Whose lead is still active:        ${deletedButLeadAlive}  ← incorrectly deleted`);
  console.log(`  Whose opportunity is still active: ${deletedButOppAlive}  ← incorrectly deleted`);
  console.log(`  Standalone (no lead/opp):          ${deletedStandalone}  ← may be incorrectly deleted`);

  if (deletedButLeadAlive + deletedButOppAlive + deletedStandalone > 0) {
    console.log(`\n⚠️  Run scripts/restore-tasks.ts to recover these tasks.`);
  } else {
    console.log(`\n✓ All deleted tasks have deleted parents — cascade was correct.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
