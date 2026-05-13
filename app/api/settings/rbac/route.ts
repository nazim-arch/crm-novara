import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync, DEFAULT_PERMS, ALL_PERMISSIONS, type Permission } from "@/lib/rbac";

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

  await prisma.systemSetting.upsert({
    where: { key: "rbac" },
    create: { key: "rbac", value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });

  return NextResponse.json({ ok: true });
}
