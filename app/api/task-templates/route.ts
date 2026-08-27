import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermissionAsync } from "@/lib/rbac";
import { createTaskTemplateSchema } from "@/lib/validations/task-template";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "task:read"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.taskTemplate.findMany({
      where: { is_active: true },
      include: {
        default_assignee: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error("GET /api/task-templates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "task:create"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createTaskTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const { description, sector, default_assignee_id, client_id, ...rest } = parsed.data;
    const template = await prisma.taskTemplate.create({
      data: {
        ...rest,
        description: description || null,
        sector: sector || null,
        default_assignee_id: default_assignee_id || null,
        client_id: client_id || null,
        created_by_id: session.user.id,
      },
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    console.error("POST /api/task-templates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
