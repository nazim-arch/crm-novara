import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermissionAsync } from "@/lib/rbac";
import { DEFAULT_PERMS, type Permission } from "@/lib/rbac-constants";
import { RbacEditor } from "@/components/settings/RbacEditor";

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user || !(await hasPermissionAsync(session.user.role, "user:manage"))) {
    redirect("/dashboard/crm");
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: "rbac" } });
  const currentConfig: Record<string, Permission[]> = setting?.value
    ? JSON.parse(setting.value)
    : DEFAULT_PERMS;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Role Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Configure what each role can do across the application.
        </p>
      </div>
      <RbacEditor initialConfig={currentConfig} defaultConfig={DEFAULT_PERMS} />
    </div>
  );
}
