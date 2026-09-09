import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Prisma, LeadStatus } from "@/lib/generated/prisma/client";
import { hasPermissionAsync, leadScopeFilter } from "@/lib/rbac";

/**
 * Fix #5 — Lead visibility. The single source of truth for "which leads/links a role may see".
 * Visibility is a property of the LINK (LeadOpportunity), not the Lead.
 *
 * IMPORTANT: the only exported way to build a lead `where` is `leadAccessFilter`, and it is async.
 * Never build a lead `where` from the pieces yourself — a forgotten `await` on an async builder
 * yields a truthy Promise which, inside a Prisma `where`, silently drops the filter and exposes
 * everything. `leadScopeFilter` (ownership) stays available from lib/rbac for now but must be
 * composed only through `leadAccessFilter`.
 */

/** Roles whose lead view is unrestricted. ALLOW-LIST: a new role is restricted by default (D4). */
export const UNRESTRICTED_ROLES = ["Admin"] as const;

/** Link statuses that end the agent's claim on that opportunity. */
export const DEAD_LINK_STATUSES = ["Lost", "InvalidLead"] as const;

/** Link statuses that survive closure of their opportunity (earned credit — D2). */
export const RETAINED_ON_CLOSE = ["Booked", "Won"] as const;

/** Lead-level kill switches — hide the whole lead whatever its other links say (D1/D3, founder). */
export const LEAD_LEVEL_HIDDEN = ["InvalidLead", "Recycle"] as const;

/** Statuses that never render as a visible row. */
const HIDDEN_ROW_STATUSES = ["Lost", "InvalidLead", "Recycle"] as const;

const asLeadStatus = (xs: readonly string[]) => xs as unknown as LeadStatus[];

/**
 * R1 — a link (= one row in the leads table) is visible to a restricted role. Visible iff it is not
 * dead/recycled, not soft-untagged, its opportunity is not soft-deleted, AND (its opportunity is
 * Active OR the agent earned it Booked/Won).
 */
export const visibleLinkWhere: Prisma.LeadOpportunityWhereInput = {
  status: { notIn: asLeadStatus(HIDDEN_ROW_STATUSES) },
  untagged_at: null,
  opportunity: { deleted_at: null }, // safety net for pre-existing data (see spec §3 note)
  OR: [
    { opportunity: { status: "Active" } },
    { status: { in: asLeadStatus(RETAINED_ON_CLOSE) } },
  ],
};

/**
 * R2 — the lead-level `where` for a restricted role. Named so it cannot read as a value in a
 * `where` object by accident. Honors the founder's "Invalid/Recycle = lead-level kill": a lead is
 * hidden if its rollup status is Invalid/Recycle OR it holds any active Invalid/Recycle link, even
 * if it still has a live link elsewhere. (Marking a Booked/Won lead Invalid/Recycle is blocked at
 * the write path, so this never hides earned credit.)
 */
export function buildLeadVisibilityWhere(): Prisma.LeadWhereInput {
  return {
    AND: [
      { status: { notIn: asLeadStatus(LEAD_LEVEL_HIDDEN) } },
      { opportunities: { none: { status: { in: asLeadStatus(LEAD_LEVEL_HIDDEN) }, untagged_at: null } } },
      {
        OR: [
          { opportunities: { some: visibleLinkWhere } },
          {
            AND: [
              { opportunities: { none: { untagged_at: null } } },
              { status: { notIn: asLeadStatus(["Lost", "InvalidLead", "Recycle"]) } },
            ],
          },
        ],
      },
    ],
  };
}

/** True if the role bypasses visibility (Admin, or a role granted lead:view_hidden). Fails closed. */
export async function canViewHidden(role: string): Promise<boolean> {
  if ((UNRESTRICTED_ROLES as readonly string[]).includes(role)) return true;
  try {
    return await hasPermissionAsync(role, "lead:view_hidden");
  } catch {
    return false; // RBAC unreadable → restricted (fail closed)
  }
}

/** Whether the Fix #5 visibility rule is switched on (rollback flag). Off/unreadable → disabled. */
export const isLeadVisibilityEnabled = cache(async (): Promise<boolean> => {
  try {
    const s = await prisma.systemSetting.findUnique({ where: { key: "lead_visibility_v2" } });
    return s?.value === "true";
  } catch {
    return false;
  }
});

/**
 * THE ONLY lead `where` builder. Composes ownership scope (leadScopeFilter) with visibility (R2).
 * Returns null when nothing constrains the query (Admin with the flag off, etc.).
 */
export async function leadAccessFilter(role: string, userId: string): Promise<Prisma.LeadWhereInput | null> {
  const parts: Prisma.LeadWhereInput[] = [];

  const scope = leadScopeFilter(role, userId); // ownership axis — unchanged
  if (scope) parts.push(scope);

  if ((await isLeadVisibilityEnabled()) && !(await canViewHidden(role))) {
    parts.push(buildLeadVisibilityWhere()); // visibility axis
  }

  return parts.length ? { AND: parts } : null;
}

/** Descriptors for the read-only Data Access panel (Phase 6) — generated, not hand-written. */
export const RECORD_SCOPE_BY_ROLE: Record<string, string> = {
  Admin: "All records",
  Manager: "All records",
  Operations: "All records",
  Viewer: "All records",
  TeamLead: "Own + direct reports'",
  Sales: "Own only",
};
