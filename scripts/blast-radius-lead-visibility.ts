/**
 * Fix #5 Phase 1 (item 10) — READ-ONLY blast-radius report for lead_visibility_v2.
 *
 * Reports, per active user, how many leads they can see today (ownership scope only, i.e. flag OFF)
 * vs how many they would see once the rule is ON, and a global breakdown of how many links each
 * reason hides. Also prints the Vinod Kumar DS-LEAD-000364 fixture in detail. Writes nothing.
 *
 * The visibility predicates are mirrored inline from lib/lead-visibility.ts because that module is
 * `server-only` and cannot be imported into a plain node/tsx script. Keep them in sync.
 *
 *   npx tsx scripts/blast-radius-lead-visibility.ts
 *   (target a specific branch by setting DATABASE_URL inline)
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient, type Prisma } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

// ── mirrored from lib/lead-visibility.ts ────────────────────────────────────────
const RETAINED = ["Booked", "Won"] as const;
const LEAD_LEVEL_HIDDEN = ["InvalidLead", "Recycle"] as const;
const HIDDEN_ROW = ["Lost", "InvalidLead", "Recycle"] as const;

const visibleLinkWhere = {
  status: { notIn: HIDDEN_ROW as unknown as Prisma.EnumLeadStatusFilter["notIn"] },
  untagged_at: null,
  opportunity: { deleted_at: null },
  OR: [
    { opportunity: { status: "Active" } },
    { status: { in: RETAINED as unknown as Prisma.EnumLeadStatusFilter["in"] } },
  ],
} as Prisma.LeadOpportunityWhereInput;

function buildLeadVisibilityWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      { status: { notIn: LEAD_LEVEL_HIDDEN as unknown as Prisma.EnumLeadStatusFilter["notIn"] } },
      { opportunities: { none: { status: { in: LEAD_LEVEL_HIDDEN as unknown as Prisma.EnumLeadStatusFilter["in"] }, untagged_at: null } } },
      {
        OR: [
          { opportunities: { some: visibleLinkWhere } },
          {
            AND: [
              { opportunities: { none: { untagged_at: null } } },
              { status: { notIn: HIDDEN_ROW as unknown as Prisma.EnumLeadStatusFilter["notIn"] } },
            ],
          },
        ],
      },
    ],
  };
}

// mirrored from lib/rbac.ts leadScopeFilter (ownership axis, unchanged by Fix #5)
function scopeFilter(role: string, userId: string): Prisma.LeadWhereInput | null {
  if (role === "TeamLead") {
    return {
      OR: [
        { assigned_to_id: userId }, { lead_owner_id: userId }, { created_by_id: userId },
        { assigned_to: { manager_id: userId } }, { lead_owner: { manager_id: userId } }, { created_by: { manager_id: userId } },
      ],
    };
  }
  if (role === "Sales") {
    return { OR: [{ assigned_to_id: userId }, { lead_owner_id: userId }, { created_by_id: userId }] };
  }
  return null; // Admin/Manager/Operations/Viewer — no ownership scope
}

const and = (...parts: (Prisma.LeadWhereInput | null)[]) => {
  const xs = parts.filter(Boolean) as Prisma.LeadWhereInput[];
  return xs.length ? { AND: xs } : {};
};

async function main() {
  console.log("host:", new URL(process.env.DATABASE_URL!).host);
  console.log("");

  const users = await prisma.user.findMany({
    where: { is_active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, role: true },
  });

  console.log("=== Per-user: leads visible BEFORE (flag off) vs AFTER (flag on) ===");
  const rows: { user: string; role: string; before: number; after: number; hidden: number }[] = [];
  for (const u of users) {
    const scope = scopeFilter(u.role, u.id);
    const base: Prisma.LeadWhereInput = { deleted_at: null };
    const before = await prisma.lead.count({ where: and(base, scope) });
    // Admin (and any role with lead:view_hidden) bypasses visibility → after == before.
    const after =
      u.role === "Admin"
        ? before
        : await prisma.lead.count({ where: and(base, scope, buildLeadVisibilityWhere()) });
    rows.push({ user: u.name, role: u.role, before, after, hidden: before - after });
  }
  console.table(rows);

  console.log("=== Global hidden-link breakdown (active, non-untagged links) ===");
  const [deadLinks, closedOppLinks, leadLevelHiddenLeads] = await Promise.all([
    prisma.leadOpportunity.count({
      where: { untagged_at: null, status: { in: ["Lost", "InvalidLead"] as unknown as Prisma.EnumLeadStatusFilter["in"] } },
    }),
    prisma.leadOpportunity.count({
      where: {
        untagged_at: null,
        status: { notIn: HIDDEN_ROW as unknown as Prisma.EnumLeadStatusFilter["notIn"] },
        NOT: { status: { in: RETAINED as unknown as Prisma.EnumLeadStatusFilter["in"] } },
        opportunity: { deleted_at: null, status: { not: "Active" } },
      },
    }),
    prisma.lead.count({
      where: {
        deleted_at: null,
        OR: [
          { status: { in: LEAD_LEVEL_HIDDEN as unknown as Prisma.EnumLeadStatusFilter["in"] } },
          { opportunities: { some: { untagged_at: null, status: { in: LEAD_LEVEL_HIDDEN as unknown as Prisma.EnumLeadStatusFilter["in"] } } } },
        ],
      },
    }),
  ]);
  console.table([
    { reason: "Dead link (Lost / InvalidLead)", links: deadLinks },
    { reason: "Closed opportunity (opp not Active, link not Booked/Won)", links: closedOppLinks },
    { reason: "Lead-level hidden (Invalid/Recycle lead)", leads: leadLevelHiddenLeads },
  ]);

  console.log("=== Fixture: DS-LEAD-000364 (Vinod Kumar) ===");
  const vinod = await prisma.lead.findFirst({
    where: { lead_number: "DS-LEAD-000364" },
    select: {
      lead_number: true, full_name: true, status: true,
      opportunities: {
        select: {
          status: true, untagged_at: true,
          opportunity: { select: { name: true, opp_number: true, status: true, deleted_at: true } },
        },
      },
    },
  });
  if (!vinod) {
    console.log("  DS-LEAD-000364 not found on this branch.");
  } else {
    console.log(`  ${vinod.lead_number} ${vinod.full_name} — lead.status=${vinod.status}`);
    for (const l of vinod.opportunities) {
      const earned = (RETAINED as readonly string[]).includes(l.status);
      const dead = (HIDDEN_ROW as readonly string[]).includes(l.status);
      const oppActive = l.opportunity.status === "Active";
      const visible = !l.untagged_at && !l.opportunity.deleted_at && !dead && (oppActive || earned);
      console.log(
        `   - ${l.opportunity.opp_number} "${l.opportunity.name}" [opp:${l.opportunity.status}]` +
        ` link:${l.status}${l.untagged_at ? " (untagged)" : ""} → ${visible ? "VISIBLE" : "hidden"}`
      );
    }
    const anyVisible = vinod.opportunities.some((l) => {
      const earned = (RETAINED as readonly string[]).includes(l.status);
      const dead = (HIDDEN_ROW as readonly string[]).includes(l.status);
      return !l.untagged_at && !l.opportunity.deleted_at && !dead && (l.opportunity.status === "Active" || earned);
    });
    console.log(`  → lead is ${anyVisible ? "VISIBLE" : "HIDDEN"} to a restricted role under the rule.`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
