import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { leadAccessFilter } from "@/lib/lead-visibility";

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

    // §5.3 — never reveal a match the caller may not see. Split into visible (returned in full) and
    // hidden (collapsed to a PII-free restricted flag). No Admin notification on this passive lookup;
    // that fires only when a restricted user actually attempts to create the duplicate.
    const access = await leadAccessFilter(session.user.role, session.user.id);
    let visibleIds: Set<string>;
    if (access && exactMatches.length > 0) {
      const visible = await prisma.lead.findMany({
        where: { AND: [{ id: { in: exactMatches.map((m) => m.id) } }, access] },
        select: { id: true },
      });
      visibleIds = new Set(visible.map((v) => v.id));
    } else {
      visibleIds = new Set(exactMatches.map((m) => m.id)); // no constraint → all visible
    }

    const visibleMatches = exactMatches.filter((m) => visibleIds.has(m.id));
    const restrictedCount = exactMatches.length - visibleMatches.length;

    return NextResponse.json({
      exact_matches: visibleMatches,
      name_similar: [],
      has_duplicates: exactMatches.length > 0,
      restricted_duplicate: restrictedCount > 0,
    });
  } catch (error) {
    console.error("GET /api/leads/check-duplicate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
