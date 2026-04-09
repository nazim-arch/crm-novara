import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { UserManagementClient } from "@/components/settings/UserManagementClient";

export default async function UsersSettingsPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
    redirect("/dashboard/crm");
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      phone: true,
      created_at: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">User Management</h1>
        <p className="text-sm text-muted-foreground">Manage team members and their roles</p>
      </div>
      <UserManagementClient users={users} />
    </div>
  );
}
