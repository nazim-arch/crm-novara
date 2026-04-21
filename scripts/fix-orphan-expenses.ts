import { prisma } from "../lib/prisma";

async function main() {
  // Find expenses linked to soft-deleted opportunities
  const orphaned = await prisma.opportunityExpense.findMany({
    where: { opportunity: { deleted_at: { not: null } } },
    select: { id: true, amount: true, opportunity: { select: { name: true } } },
  });

  if (orphaned.length === 0) {
    console.log("No orphaned expenses found.");
    return;
  }

  console.log(`Found ${orphaned.length} orphaned expense(s):`);
  for (const e of orphaned) {
    console.log(`  - ₹${Number(e.amount).toLocaleString("en-IN")} on "${e.opportunity.name}"`);
  }

  await prisma.opportunityExpense.deleteMany({
    where: { opportunity: { deleted_at: { not: null } } },
  });

  console.log("Deleted all orphaned expenses.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
