export type Permission =
  | "lead:create" | "lead:read" | "lead:update" | "lead:delete"
  | "opportunity:create" | "opportunity:update" | "opportunity:read" | "opportunity:delete"
  | "task:create" | "task:read" | "task:update" | "task:delete"
  | "user:manage" | "report:view" | "financial:view"
  | "podcast_studio:manage";

const PERMS: Record<string, Permission[]> = {
  Admin: [
    "lead:create", "lead:read", "lead:update", "lead:delete",
    "opportunity:create", "opportunity:update", "opportunity:read", "opportunity:delete",
    "task:create", "task:read", "task:update", "task:delete",
    "user:manage", "report:view", "financial:view",
    "podcast_studio:manage",
  ],
  Sales: [
    "lead:create", "lead:read", "lead:update",
    "opportunity:read",
    "task:create", "task:read", "task:update",
  ],
  Operations: [
    "task:create", "task:read", "task:update",
  ],
  // Legacy roles — keep for backward compat
  Manager: [
    "lead:create", "lead:read", "lead:update", "lead:delete",
    "opportunity:create", "opportunity:update", "opportunity:read", "opportunity:delete",
    "task:create", "task:read", "task:update", "task:delete",
    "report:view", "financial:view",
  ],
  Viewer: ["lead:read", "task:read", "opportunity:read", "report:view"],
};

export function hasPermission(role: string, perm: Permission): boolean {
  return PERMS[role]?.includes(perm) ?? false;
}

// Returns additional WHERE clause for lead queries based on role
export function leadScopeFilter(role: string, userId: string) {
  if (role === "Sales") {
    return { OR: [{ assigned_to_id: userId }, { lead_owner_id: userId }] };
  }
  return null; // Admin/Manager/Viewer see all
}

// Returns additional WHERE clause for task queries based on role
export function taskScopeFilter(role: string, userId: string) {
  if (role === "Sales" || role === "Operations") {
    return { assigned_to_id: userId };
  }
  return null;
}

// Returns default landing path by role
export function defaultLandingPath(role: string): string {
  if (role === "Operations") return "/tasks";
  if (role === "Sales") return "/leads";
  return "/dashboard/crm";
}
