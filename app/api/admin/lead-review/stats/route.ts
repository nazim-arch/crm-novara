import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin" && session.user.role !== "Manager") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, reviewed, parked, escalated, askAgent, todayPending] = await Promise.all([
      prisma.leadReviewEvent.count({ where: { review_status: "Pending" } }),
      prisma.leadReviewEvent.count({ where: { review_status: "Reviewed" } }),
      prisma.leadReviewEvent.count({ where: { review_status: "Parked" } }),
      prisma.leadReviewEvent.count({ where: { review_status: "Escalated" } }),
      prisma.leadReviewEvent.count({ where: { review_status: "AskAgent" } }),
      prisma.leadReviewEvent.count({
        where: { review_status: "Pending", created_at: { gte: todayStart } },
      }),
    ]);

    return NextResponse.json({ pending, reviewed, parked, escalated, ask_agent: askAgent, today: todayPending });
  } catch (error) {
    console.error("GET /api/admin/lead-review/stats:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
