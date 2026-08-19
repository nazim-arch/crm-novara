import { prisma } from "../lib/prisma";
import { NO_FOLLOWUP_STATUSES } from "../lib/follow-ups";

/**
 * Invariant check for Fix #3 (Single Active Follow-up). Run after the migration/backfill or any
 * bulk data change:  npx tsx scripts/qa-single-active-followup.ts
 *
 * Verifies:
 *  1. No lead has more than one Active follow-up.
 *  2. No lead in a no-follow-up status has an Active follow-up or a non-null next_followup_date.
 *  3. Every live lead in an active pipeline status with a non-null next_followup_date has exactly
 *     one Active follow-up — and vice-versa (the lead mirror is consistent).
 */
async function main() {
  let violations = 0;
  const fail = (msg: string) => { violations++; console.error(`  ✗ ${msg}`); };

  // 1. More than one Active follow-up per lead.
  const dupActive = await prisma.followUp.groupBy({
    by: ["lead_id"],
    where: { status: "Active", lead_id: { not: null } },
    _count: { _all: true },
    having: { lead_id: { _count: { gt: 1 } } },
  });
  for (const d of dupActive) fail(`Lead ${d.lead_id} has ${d._count._all} Active follow-ups (must be ≤ 1)`);

  // 2. No-follow-up-status leads must have zero Active follow-ups and a null mirror.
  const badTerminal = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      status: { in: [...NO_FOLLOWUP_STATUSES] },
      OR: [{ next_followup_date: { not: null } }, { followups: { some: { status: "Active" } } }],
    },
    select: { lead_number: true, status: true },
  });
  for (const l of badTerminal) {
    fail(`Lead ${l.lead_number} is ${l.status} but still has an Active follow-up or next_followup_date`);
  }

  // 3a. Active pipeline lead with a mirror date but no Active follow-up.
  const mirrorNoActive = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      status: { notIn: [...NO_FOLLOWUP_STATUSES] },
      next_followup_date: { not: null },
      followups: { none: { status: "Active" } },
    },
    select: { lead_number: true },
  });
  for (const l of mirrorNoActive) fail(`Lead ${l.lead_number} has next_followup_date set but no Active follow-up`);

  // 3b. Active follow-up but null mirror.
  const activeNoMirror = await prisma.lead.findMany({
    where: {
      deleted_at: null,
      next_followup_date: null,
      followups: { some: { status: "Active" } },
    },
    select: { lead_number: true },
  });
  for (const l of activeNoMirror) fail(`Lead ${l.lead_number} has an Active follow-up but next_followup_date is null`);

  const [active, completed, superseded, cancelled] = await Promise.all([
    prisma.followUp.count({ where: { status: "Active" } }),
    prisma.followUp.count({ where: { status: "Completed" } }),
    prisma.followUp.count({ where: { status: "Superseded" } }),
    prisma.followUp.count({ where: { status: "Cancelled" } }),
  ]);

  console.log("\nFollow-up status counts:");
  console.log(`  Active:     ${active}`);
  console.log(`  Completed:  ${completed}`);
  console.log(`  Superseded: ${superseded}`);
  console.log(`  Cancelled:  ${cancelled}`);

  if (violations === 0) console.log("\n✓ All single-active-follow-up invariants hold.");
  else console.error(`\n✗ ${violations} invariant violation(s) found.`);

  await prisma.$disconnect();
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
