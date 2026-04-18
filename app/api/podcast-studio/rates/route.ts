import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { z } from "zod";

const SEATER_TYPES = ["1-Seater", "2-Seater", "3-Seater", "4-Seater"] as const;

const updateSchema = z.object({
  rates: z.array(z.object({
    seater_type: z.enum(SEATER_TYPES),
    recording_rate_per_hour: z.number().min(0),
    editing_rate_per_hour: z.number().min(0),
  })),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rates = await prisma.podcastStudioRate.findMany({
      orderBy: { seater_type: "asc" },
    });

    // Ensure all 4 seater types are present (seed if missing)
    const existing = new Set(rates.map(r => r.seater_type));
    const missing = SEATER_TYPES.filter(s => !existing.has(s));
    if (missing.length > 0) {
      await prisma.podcastStudioRate.createMany({
        data: missing.map(s => ({ seater_type: s, recording_rate_per_hour: 0, editing_rate_per_hour: 0 })),
        skipDuplicates: true,
      });
      const refreshed = await prisma.podcastStudioRate.findMany({ orderBy: { seater_type: "asc" } });
      return NextResponse.json({ data: refreshed.map(r => ({ ...r, recording_rate_per_hour: Number(r.recording_rate_per_hour), editing_rate_per_hour: Number(r.editing_rate_per_hour) })) });
    }

    return NextResponse.json({ data: rates.map(r => ({ ...r, recording_rate_per_hour: Number(r.recording_rate_per_hour), editing_rate_per_hour: Number(r.editing_rate_per_hour) })) });
  } catch (error) {
    console.error("GET /api/podcast-studio/rates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasPermission(session.user.role, "podcast_studio:manage"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });

    const updates = await Promise.all(
      parsed.data.rates.map(r =>
        prisma.podcastStudioRate.upsert({
          where: { seater_type: r.seater_type },
          update: { recording_rate_per_hour: r.recording_rate_per_hour, editing_rate_per_hour: r.editing_rate_per_hour },
          create: { seater_type: r.seater_type, recording_rate_per_hour: r.recording_rate_per_hour, editing_rate_per_hour: r.editing_rate_per_hour },
        })
      )
    );

    return NextResponse.json({ data: updates.map(r => ({ ...r, recording_rate_per_hour: Number(r.recording_rate_per_hour), editing_rate_per_hour: Number(r.editing_rate_per_hour) })) });
  } catch (error) {
    console.error("PATCH /api/podcast-studio/rates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
