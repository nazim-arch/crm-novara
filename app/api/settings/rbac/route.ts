import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import {
  DEFAULT_PERMS,
  ALL_PERMISSIONS,
  GUARDED_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from "@/lib/rbac-constants";
import { notifyRbacGuardedGrant } from "@/lib/email-notifications";

type PermChange = { role: string; permission: Permission; granted: boolean };

/** Per-role diff of stored vs incoming config → one entry per individual permission change. */
function diffConfigs(
  before: Record<string, Permission[]>,
  after: Record<string, Permission[]>,
): PermChange[] {
  const changes: PermChange[] = [];
  const roles = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const role of roles) {
    const prev = new Set(before[role] ?? []);
    const next = new Set(after[role] ?? []);
    for (const perm of next) if (!prev.has(perm)) changes.push({ role, permission: perm, granted: true });
    for (const perm of prev) if (!next.has(perm)) changes.push({ role, permission: perm, granted: false });
  }
  return changes;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermissionAsync(session.user.role, "user:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
  const config = setting?.value ? JSON.parse(setting.value) : DEFAULT_PERMS;
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasPermissionAsync(session.user.role, "user:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const config = body.config as Record<string, Permission[]>;

  // Validate that all permissions are known
  for (const perms of Object.values(config)) {
    for (const perm of perms) {
      if (!ALL_PERMISSIONS.includes(perm)) {
        return NextResponse.json({ error: `Unknown permission: ${perm}` }, { status: 400 });
      }
    }
  }

  // Diff against the currently stored config (Fix #5 §6.6 — audit + guarded-grant gate).
  const stored = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
  const before: Record<string, Permission[]> = stored?.value ? JSON.parse(stored.value) : DEFAULT_PERMS;
  const changes = diffConfigs(before, config);

  // Turning a guarded permission ON on a NON-Admin role must carry explicit confirmation.
  const guardedGrants = changes.filter(
    (c) => c.granted && c.role !== "Admin" && (GUARDED_PERMISSIONS as Permission[]).includes(c.permission),
  );
  if (guardedGrants.length > 0 && body.confirm !== true) {
    return NextResponse.json(
      {
        error: "Granting a Restricted Data Access permission requires confirmation.",
        code: "GUARDED_GRANT_REQUIRES_CONFIRM",
        guardedGrants: guardedGrants.map((g) => ({ role: g.role, permission: g.permission })),
      },
      { status: 400 },
    );
  }

  await prisma.systemSetting.upsert({
    where: { key: "rbac" },
    create: { key: "rbac", value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });

  // One Activity row per individual permission change — closing behind the config blob was invisible.
  if (changes.length > 0) {
    await prisma.activity.createMany({
      data: changes.map((c) => ({
        entity_type: "User" as const,
        entity_id: c.role,
        action: c.granted ? "rbac_permission_granted" : "rbac_permission_revoked",
        actor_id: session.user.id,
        metadata: {
          role: c.role,
          permission: c.permission,
          label: PERMISSION_LABELS[c.permission],
          guarded: (GUARDED_PERMISSIONS as Permission[]).includes(c.permission),
        },
      })),
    });
  }

  // Email all Admins when a guarded protection is switched off for another role.
  if (guardedGrants.length > 0) {
    notifyRbacGuardedGrant({
      actorId: session.user.id,
      actorName: session.user.name ?? session.user.email ?? "An admin",
      grants: guardedGrants.map((g) => ({
        role: g.role,
        permission: g.permission,
        label: PERMISSION_LABELS[g.permission],
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
