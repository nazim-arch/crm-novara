import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const reassignSchema = z.object({
  reassign_to: z.string().min(1),
});

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const [leadCount, taskCount] = await Promise.all([
      prisma.lead.count({ where: { assigned_to_id: id, deleted_at: null } }),
      prisma.task.count({ where: { assigned_to_id: id, deleted_at: null, status: { notIn: ["Done", "Cancelled"] } } }),
    ]);
    return NextResponse.json({ data: { leadCount, taskCount } });
  } catch (error) {
    console.error("GET /api/users/[id]/reassign:", error);
    return NextResponse.json({ error: "Failed to check workload" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "user:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const parsed = reassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "reassign_to is required" }, { status: 400 });
  }
  const { reassign_to } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: reassign_to, is_active: true } });
  if (!target) return NextResponse.json({ error: "Target user not found or inactive" }, { status: 404 });

  const [leads, tasks] = await Promise.all([
    prisma.lead.updateMany({
      where: { assigned_to_id: id, deleted_at: null },
      data: { assigned_to_id: reassign_to },
    }),
    prisma.task.updateMany({
      where: { assigned_to_id: id, deleted_at: null, status: { notIn: ["Done", "Cancelled"] } },
      data: { assigned_to_id: reassign_to },
    }),
  ]);

  return NextResponse.json({ data: { leadsReassigned: leads.count, tasksReassigned: tasks.count } });
}
