import { prisma } from "../lib/prisma";

async function main() {
  // Restore standalone tasks (no parent lead or opportunity)
  const restoredStandalone = await prisma.task.updateMany({
    where: {
      deleted_at: { not: null },
      lead_id: null,
      opportunity_id: null,
    },
    data: { deleted_at: null },
  });

  // Restore tasks whose linked lead is still active
  const restoredLeadTasks = await prisma.task.updateMany({
    where: {
      deleted_at: { not: null },
      lead: { deleted_at: null },
    },
    data: { deleted_at: null },
  });

  // Restore tasks whose linked opportunity is still active
  const restoredOppTasks = await prisma.task.updateMany({
    where: {
      deleted_at: { not: null },
      opportunity: { deleted_at: null },
    },
    data: { deleted_at: null },
  });

  console.log(`Restored ${restoredStandalone.count} standalone tasks`);
  console.log(`Restored ${restoredLeadTasks.count} tasks with active leads`);
  console.log(`Restored ${restoredOppTasks.count} tasks with active opportunities`);

  const remaining = await prisma.task.count({ where: { deleted_at: { not: null } } });
  console.log(`\nTasks still deleted (parent also deleted): ${remaining}`);
  const active = await prisma.task.count({ where: { deleted_at: null } });
  console.log(`Tasks now active: ${active}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
