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
import { DEFAULT_PERMS } from "@/lib/rbac-constants";

// Synchronous check against static defaults
export function hasPermission(role: string, perm: Permission): boolean {
  return DEFAULT_PERMS[role]?.includes(perm) ?? false;
}

// Per-request memoized DB read — one DB call per request, no stale data across requests
export const getRbacConfig = cache(async (): Promise<Record<string, Permission[]>> => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
    if (setting?.value) {
      return JSON.parse(setting.value) as Record<string, Permission[]>;
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
  if (role === "Sales" || role === "Operations") {
    return { assigned_to_id: userId };
  }
  return null;
}

export function defaultLandingPath(role: string): string {
  if (role === "Operations") return "/tasks";
  if (role === "Sales") return "/dashboard/command";
  return "/dashboard/crm";
}
