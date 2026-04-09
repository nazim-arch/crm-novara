import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Params = Promise<{ id: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.user_id !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.notification.update({ where: { id }, data: { read: true } });
  return NextResponse.json({ data: { success: true } });
}
