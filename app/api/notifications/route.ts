import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      user_id: session.user.id,
      ...(unreadOnly && { read: false }),
    },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: notifications });
}
