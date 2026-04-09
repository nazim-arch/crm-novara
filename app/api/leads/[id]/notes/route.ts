import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const noteSchema = z.object({
  content: z.string().min(1, "Note cannot be empty"),
});

export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const notes = await prisma.note.findMany({
      where: { entity_type: "Lead", entity_id: id },
      include: {
        created_by: { select: { id: true, name: true, avatar_url: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ data: notes });
  } catch (error) {
    console.error("GET /api/leads/[id]/notes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [note] = await prisma.$transaction([
      prisma.note.create({
        data: {
          entity_type: "Lead",
          entity_id: id,
          content: parsed.data.content,
          created_by_id: session.user.id,
        },
        include: {
          created_by: { select: { id: true, name: true, avatar_url: true } },
        },
      }),
      prisma.activity.create({
        data: {
          entity_type: "Lead",
          entity_id: id,
          action: "note_added",
          actor_id: session.user.id,
          metadata: { preview: parsed.data.content.slice(0, 100) },
        },
      }),
    ]);

    return NextResponse.json({ data: note }, { status: 201 });
  } catch (error) {
    console.error("POST /api/leads/[id]/notes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
