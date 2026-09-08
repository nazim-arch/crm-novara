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
 * Merge DEFAULT_PERMS for permissions the stored config has never seen. A stored RBAC config is a
 * point-in-time snapshot; when a new permission ships (e.g. commission:reconcile) it is absent from
 * every role in the snapshot, so no one — not even Admin — would get it until Roles is re-saved.
 * We treat a permission that appears for NO role as "brand new" and fall back to its DEFAULT_PERMS
 * grants. Once an admin saves Roles, the permission becomes known and their explicit choice sticks.
 */
function withNewDefaults(stored: Record<string, Permission[]>): Record<string, Permission[]> {
  const known = new Set<Permission>();
  for (const perms of Object.values(stored)) for (const p of perms) known.add(p);
  const brandNew = ALL_PERMISSIONS.filter((p) => !known.has(p));
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
    const setting = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
    if (setting?.value) {
      return withNewDefaults(JSON.parse(setting.value) as Record<string, Permission[]>);
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
