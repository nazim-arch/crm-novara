import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyMcpToken } from "@/lib/mcp-auth";

type Params = Promise<{ id: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;

    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { deleted_at: null, OR: [{ id }, { task_number: id }] },
      include: {
        assigned_to: { select: { id: true, name: true, email: true } },
        created_by: { select: { id: true, name: true } },
        lead: { select: { id: true, lead_number: true, full_name: true, phone: true } },
        opportunity: { select: { id: true, opp_number: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    console.error("GET /api/mcp/tasks/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const auth = await verifyMcpToken(request);
    if (!(auth as { valid: true }).valid) return auth as NextResponse;
    const { userId } = auth as { valid: true; userId: string };

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const task = await prisma.task.findFirst({
      where: { deleted_at: null, OR: [{ id }, { task_number: id }] },
      select: { id: true, status: true, recurrence: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const allowedFields = ["title", "description", "priority", "status", "due_date", "start_date", "sector", "assigned_to_id"];
    const data: Record<string, unknown> = { updated_at: new Date() };
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field];
    }

    if (body.status === "Done" && task.status !== "Done") {
      data.completion_date = new Date();
    }

    if (Object.keys(data).length <= 1) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    const updated = await prisma.task.update({ where: { id: task.id }, data });

    await prisma.activity.create({
      data: {
        entity_type: "Task",
        entity_id: task.id,
        action: body.status === "Done" ? "task_completed" : "task_updated",
        actor_id: userId,
        metadata: { fields: Object.keys(data).filter((k) => k !== "updated_at"), source: "mcp" },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/mcp/tasks/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
