export type Permission =
  | "lead:create" | "lead:read" | "lead:update" | "lead:delete" | "lead:import" | "lead:export"
  | "opportunity:create" | "opportunity:update" | "opportunity:read" | "opportunity:delete" | "opportunity:export"
  | "task:create" | "task:read" | "task:update" | "task:delete" | "task:export"
  | "user:manage" | "report:view" | "financial:view"
  | "podcast_studio:manage"
  | "commission:manage" | "commission:view";

export const ROLES = ["Admin", "Manager", "TeamLead", "Sales", "Operations", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ALL_PERMISSIONS: Permission[] = [
  "lead:read", "lead:create", "lead:update", "lead:delete", "lead:import", "lead:export",
  "opportunity:read", "opportunity:create", "opportunity:update", "opportunity:delete", "opportunity:export",
  "task:read", "task:create", "task:update", "task:delete", "task:export",
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
  "lead:export":            "Export Leads to Excel",
  "opportunity:read":       "View Opportunities",
  "opportunity:create":     "Create Opportunities",
  "opportunity:update":     "Edit Opportunities",
  "opportunity:delete":     "Delete Opportunities",
  "opportunity:export":     "Export Opportunities to Excel",
  "task:read":              "View Tasks",
  "task:create":            "Create Tasks",
  "task:update":            "Edit Tasks",
  "task:delete":            "Delete Tasks",
  "task:export":            "Export Tasks to Excel",
  "user:manage":            "Manage Users",
  "report:view":            "View Reports",
  "financial:view":         "View Financials",
  "podcast_studio:manage":  "Manage Podcast Studio",
  "commission:view":        "View Commissions",
  "commission:manage":      "Manage Commissions",
};

export const PERMISSION_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: "Leads",             perms: ["lead:read", "lead:create", "lead:update", "lead:delete", "lead:import", "lead:export"] },
  { label: "Opportunities",     perms: ["opportunity:read", "opportunity:create", "opportunity:update", "opportunity:delete", "opportunity:export"] },
  { label: "Tasks",             perms: ["task:read", "task:create", "task:update", "task:delete", "task:export"] },
  { label: "Users & Settings",  perms: ["user:manage"] },
  { label: "Reports & Finance", perms: ["report:view", "financial:view"] },
  { label: "Podcast Studio",    perms: ["podcast_studio:manage"] },
  { label: "Commissions",       perms: ["commission:view", "commission:manage"] },
];

export const DEFAULT_PERMS: Record<string, Permission[]> = {
  Admin: [
    "lead:create", "lead:read", "lead:update", "lead:delete", "lead:import", "lead:export",
    "opportunity:create", "opportunity:update", "opportunity:read", "opportunity:delete", "opportunity:export",
    "task:create", "task:read", "task:update", "task:delete", "task:export",
    "user:manage", "report:view", "financial:view",
    "podcast_studio:manage",
    "commission:manage", "commission:view",
  ],
  TeamLead: [
    "lead:create", "lead:read", "lead:update",
    "opportunity:read",
    "task:create", "task:read", "task:update",
    "commission:view",
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
  // Manager mirrors TeamLead's action permissions, but sees ALL data (no scope
  // restriction — see leadScopeFilter/taskScopeFilter, which only scope Sales/
  // Operations/TeamLead). It additionally keeps report:view + financial:view so
  // its oversight features (CRM Overview, Daily Activity, Pipeline Digest, Audit
  // Log) remain available.
  Manager: [
    "lead:create", "lead:read", "lead:update",
    "opportunity:read",
    "task:create", "task:read", "task:update",
    "commission:view",
    "report:view", "financial:view",
  ],
  Viewer: ["lead:read", "task:read", "opportunity:read", "report:view"],
};
