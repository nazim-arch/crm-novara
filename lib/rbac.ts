import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type Permission =
  | "lead:create" | "lead:read" | "lead:update" | "lead:delete" | "lead:import"
  | "opportunity:create" | "opportunity:update" | "opportunity:read" | "opportunity:delete"
  | "task:create" | "task:read" | "task:update" | "task:delete"
  | "user:manage" | "report:view" | "financial:view"
  | "podcast_studio:manage"
  | "commission:manage" | "commission:view";

export const ROLES = ["Admin", "Manager", "Sales", "Operations", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS: Permission[] = [
  "lead:read", "lead:create", "lead:update", "lead:delete", "lead:import",
  "opportunity:read", "opportunity:create", "opportunity:update", "opportunity:delete",
  "task:read", "task:create", "task:update", "task:delete",
  "user:manage", "report:view", "financial:view",
  "podcast_studio:manage",
  "commission:view", "commission:manage",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "lead:read":              "View Leads",
  "lead:create":            "Create Leads",
  "lead:update":            "Edit Leads",
  "lead:delete":            "Delete Leads",
  "lead:import":            "Import Leads (bulk upload)",
  "opportunity:read":       "View Opportunities",
  "opportunity:create":     "Create Opportunities",
  "opportunity:update":     "Edit Opportunities",
  "opportunity:delete":     "Delete Opportunities",
  "task:read":              "View Tasks",
  "task:create":            "Create Tasks",
  "task:update":            "Edit Tasks",
  "task:delete":            "Delete Tasks",
  "user:manage":            "Manage Users",
  "report:view":            "View Reports",
  "financial:view":         "View Financials",
  "podcast_studio:manage":  "Manage Podcast Studio",
  "commission:view":        "View Commissions",
  "commission:manage":      "Manage Commissions",
};

export const PERMISSION_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: "Leads",              perms: ["lead:read", "lead:create", "lead:update", "lead:delete", "lead:import"] },
  { label: "Opportunities",      perms: ["opportunity:read", "opportunity:create", "opportunity:update", "opportunity:delete"] },
  { label: "Tasks",              perms: ["task:read", "task:create", "task:update", "task:delete"] },
  { label: "Users & Settings",   perms: ["user:manage"] },
  { label: "Reports & Finance",  perms: ["report:view", "financial:view"] },
  { label: "Podcast Studio",     perms: ["podcast_studio:manage"] },
  { label: "Commissions",        perms: ["commission:view", "commission:manage"] },
];

export const DEFAULT_PERMS: Record<string, Permission[]> = {
  Admin: [
    "lead:create", "lead:read", "lead:update", "lead:delete", "lead:import",
    "opportunity:create", "opportunity:update", "opportunity:read", "opportunity:delete",
    "task:create", "task:read", "task:update", "task:delete",
    "user:manage", "report:view", "financial:view",
    "podcast_studio:manage",
    "commission:manage", "commission:view",
  ],
  Sales: [
    "lead:create", "lead:read", "lead:update",
    "opportunity:read",
    "task:create", "task:read", "task:update",
    "commission:view",
  ],
  Operations: [
    "task:create", "task:read", "task:update",
  ],
  // Legacy role — keep for backward compat
  Manager: [
    "lead:create", "lead:read", "lead:update", "lead:delete",
    "opportunity:create", "opportunity:update", "opportunity:read", "opportunity:delete",
    "task:create", "task:read", "task:update", "task:delete",
    "report:view", "financial:view",
  ],
  Viewer: ["lead:read", "task:read", "opportunity:read", "report:view"],
};

// Synchronous check against static defaults — used in edge cases
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
    return { OR: [{ assigned_to_id: userId }, { lead_owner_id: userId }] };
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
