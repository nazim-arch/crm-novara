import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const KEY_PATTERN = /^columns:[a-z0-9_-]{1,40}$/;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  const pref = await prisma.userPreference.findUnique({
    where: { user_id_key: { user_id: session.user.id, key } },
    select: { value: true },
  });
  return NextResponse.json({ key, value: pref?.value ?? null });
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const { key, value } = body as { key?: string; value?: unknown };

    if (!key || !KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      value.some((v) => typeof v !== "string" || v.length > 50)
    ) {
      return NextResponse.json(
        { error: "Value must be an array of column ids" },
        { status: 400 }
      );
    }

    await prisma.userPreference.upsert({
      where: { user_id_key: { user_id: session.user.id, key } },
      create: { user_id: session.user.id, key, value },
      update: { value },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/user/preferences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
