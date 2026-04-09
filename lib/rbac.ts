export type Permission =
  | "lead:create"
  | "lead:read"
  | "lead:update"
  | "lead:delete"
  | "opportunity:create"
  | "opportunity:update"
  | "opportunity:read"
  | "task:create"
  | "task:read"
  | "task:update"
  | "task:delete"
  | "user:manage"
  | "report:view";

const PERMS: Record<string, Permission[]> = {
  Admin: [
    "lead:create",
    "lead:read",
    "lead:update",
    "lead:delete",
    "opportunity:create",
    "opportunity:update",
    "opportunity:read",
    "task:create",
    "task:read",
    "task:update",
    "task:delete",
    "user:manage",
    "report:view",
  ],
  Manager: [
    "lead:create",
    "lead:read",
    "lead:update",
    "opportunity:create",
    "opportunity:update",
    "opportunity:read",
    "task:create",
    "task:read",
    "task:update",
    "report:view",
  ],
  Sales: [
    "lead:create",
    "lead:read",
    "lead:update",
    "opportunity:create",
    "opportunity:read",
    "task:create",
    "task:read",
    "task:update",
  ],
  Operations: ["task:create", "task:read", "task:update", "lead:read", "opportunity:read"],
  Viewer: ["lead:read", "task:read", "opportunity:read", "report:view"],
};

export function hasPermission(role: string, perm: Permission): boolean {
  return PERMS[role]?.includes(perm) ?? false;
}
