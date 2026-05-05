import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";

const schema = z.object({
  type: z.enum(["call_attempted", "whatsapp_opened", "whatsapp_message_sent"]),
});

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "lead:update"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const lead = await prisma.lead.findUnique({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const userId = session.user.id;
    const { type } = parsed.data;

    await prisma.$transaction([
      // Log in activity timeline
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: id,
          action: type,
          actor_id: userId,
          metadata: { source: "click_to_contact" },
        },
      }),
      // Update last_contact_date on the lead
      prisma.lead.update({
        where: { id },
        data: { last_contact_date: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/leads/[id]/contact:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
