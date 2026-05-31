import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const email = searchParams.get("email");
    const name = searchParams.get("name");

    if (!phone && !email && !name) {
      return NextResponse.json({ exact_matches: [], name_similar: [], has_duplicates: false });
    }

    const exactWhere = [];
    if (phone) exactWhere.push({ phone });
    if (email) exactWhere.push({ email });

    const exactMatches =
      exactWhere.length > 0
        ? await prisma.lead.findMany({
            where: {
              deleted_at: null,
              OR: exactWhere,
            },
            select: {
              id: true,
              lead_number: true,
              full_name: true,
              phone: true,
              email: true,
              status: true,
              temperature: true,
            },
            take: 5,
          })
        : [];

    return NextResponse.json({
      exact_matches: exactMatches,
      name_similar: [],
      has_duplicates: exactMatches.length > 0,
    });
  } catch (error) {
    console.error("GET /api/leads/check-duplicate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
