import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

export async function DELETE(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "task:create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    // Soft-deactivate so historical references stay intact.
    await prisma.taskTemplate.update({ where: { id }, data: { is_active: false } });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("DELETE /api/task-templates/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
