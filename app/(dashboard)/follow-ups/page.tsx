import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FollowUpsClient } from "@/components/follow-ups/FollowUpsClient";

export default async function FollowUpsPage() {
  const session = await auth();

  const role = session?.user.role ?? "";
  const isScoped = role === "Sales" || role === "Operations";
  const isManagerOrAdmin = role === "Admin" || role === "Manager";
  const userFilter = isScoped ? { assigned_to_id: session?.user.id } : {};

  const [leads, users] = await Promise.all([
    prisma.lead.findMany({
      where: {
        deleted_at: null,
        ...userFilter,
        status: { notIn: ["Won", "Lost", "Recycle"] },
      },
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        phone: true,
        status: true,
        temperature: true,
        next_followup_date: true,
        followup_type: true,
        assigned_to: { select: { id: true, name: true } },
      },
      orderBy: [{ next_followup_date: { sort: "asc", nulls: "last" } }],
      take: 500,
    }),
    isManagerOrAdmin
      ? prisma.user.findMany({
          where: { is_active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <FollowUpsClient
      leads={leads}
      users={users}
      isManagerOrAdmin={isManagerOrAdmin}
      currentUserId={session?.user.id ?? ""}
    />
  );
}
