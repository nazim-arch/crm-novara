import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = Promise<{ id: string }>;

export async function GET(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20");

  const activities = await prisma.activity.findMany({
    where: { entity_type: "Task", entity_id: id },
    include: {
      actor: { select: { id: true, name: true, avatar_url: true } },
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: activities });
}
