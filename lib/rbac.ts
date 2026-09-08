import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type { Permission, Role } from "@/lib/rbac-constants";
export {
  ROLES,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_GROUPS,
  DEFAULT_PERMS,
} from "@/lib/rbac-constants";

import type { Permission } from "@/lib/rbac-constants";
import { DEFAULT_PERMS, ALL_PERMISSIONS } from "@/lib/rbac-constants";

// Synchronous check against static defaults
export function hasPermission(role: string, perm: Permission): boolean {
  return DEFAULT_PERMS[role]?.includes(perm) ?? false;
}

/**
 * Merge DEFAULT_PERMS for permissions never seen before. When a new permission ships it is absent
 * from a stored (snapshot) config, so no one gets it until Roles is re-saved — withNewDefaults
 * fills that gap from DEFAULT_PERMS.
 *
 * "New" is decided by the explicit `rbac_known_perms` list (seeded with ALL_PERMISSIONS at the
 * Fix #5 deploy), NOT by "granted to no role". The old heuristic silently re-granted a permission
 * revoked from every role — fine for a feature flag, dangerous for a GUARDED permission (revoking
 * `lead:view_hidden` from all roles must STICK). When `knownPerms` is null (pre-seed) we fall back
 * to the old heuristic so nothing breaks before the seed runs.
 */
function withNewDefaults(
  stored: Record<string, Permission[]>,
  knownPerms: Permission[] | null,
): Record<string, Permission[]> {
  let brandNew: Permission[];
  if (knownPerms) {
    const knownSet = new Set(knownPerms);
    brandNew = ALL_PERMISSIONS.filter((p) => !knownSet.has(p));
  } else {
    const seen = new Set<Permission>();
    for (const perms of Object.values(stored)) for (const p of perms) seen.add(p);
    brandNew = ALL_PERMISSIONS.filter((p) => !seen.has(p));
  }
  if (brandNew.length === 0) return stored;

  const merged: Record<string, Permission[]> = {};
  for (const role of new Set([...Object.keys(DEFAULT_PERMS), ...Object.keys(stored)])) {
    const adds = brandNew.filter((p) => DEFAULT_PERMS[role]?.includes(p));
    merged[role] = [...(stored[role] ?? []), ...adds];
  }
  return merged;
}

// Per-request memoized DB read — one DB call per request, no stale data across requests
export const getRbacConfig = cache(async (): Promise<Record<string, Permission[]>> => {
  try {
    const settings = await prisma.systemSetting.findMany({ where: { key: { in: ["rbac", "rbac_known_perms"] } } });
    const rbac = settings.find((s) => s.key === "rbac")?.value;
    const knownRaw = settings.find((s) => s.key === "rbac_known_perms")?.value;
    const knownPerms = knownRaw ? (JSON.parse(knownRaw) as Permission[]) : null;
    if (rbac) {
      return withNewDefaults(JSON.parse(rbac) as Record<string, Permission[]>, knownPerms);
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_PERMS;
});

export async function hasPermissionAsync(role: string, perm: Permission): Promise<boolean> {
  const perms = await getRbacConfig();
  return perms[role]?.includes(perm) ?? false;
}

// Returns additional WHERE clause for lead queries based on role
export function leadScopeFilter(role: string, userId: string) {
  if (role === "TeamLead") {
    // Own leads + leads owned/assigned/created by direct reports (manager_id = userId)
    return {
      OR: [
        { assigned_to_id: userId },
        { lead_owner_id: userId },
        { created_by_id: userId },
        { assigned_to: { manager_id: userId } },
        { lead_owner: { manager_id: userId } },
        { created_by: { manager_id: userId } },
      ],
    };
  }
  if (role === "Sales") {
    return {
      OR: [
        { assigned_to_id: userId },
        { lead_owner_id: userId },
        { created_by_id: userId },
      ],
    };
  }
  return null;
}

// Returns additional WHERE clause for task queries based on role
export function taskScopeFilter(role: string, userId: string) {
  if (role === "TeamLead") {
    return {
      OR: [
        { assigned_to_id: userId },
        { assigned_to: { manager_id: userId } },
      ],
    };
  }
  if (role === "Sales" || role === "Operations") {
    return { assigned_to_id: userId };
  }
  return null;
}

export function defaultLandingPath(role: string): string {
  if (role === "Operations") return "/tasks";
  if (role === "Sales" || role === "TeamLead") return "/dashboard/command";
  return "/dashboard/crm";
}
