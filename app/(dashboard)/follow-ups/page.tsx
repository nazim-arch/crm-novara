import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FollowUpsClient } from "@/components/follow-ups/FollowUpsClient";

export default async function FollowUpsPage() {
  const session = await auth();
  const role = session?.user.role ?? "";
  const isScoped = role === "Sales" || role === "Operations";
  const isManagerOrAdmin = role === "Admin" || role === "Manager";
  const isAdmin = role === "Admin";

  const scopeFilter = isScoped
    ? {
        OR: [
          { assigned_to_id: session?.user.id },
          { created_by_id: session?.user.id },
        ],
      }
    : {};

  const [followUps, users] = await Promise.all([
    prisma.followUp.findMany({
      where: scopeFilter,
      include: {
        lead: {
          select: {
            id: true,
            lead_number: true,
            full_name: true,
            status: true,
            temperature: true,
          },
        },
        opportunity: { select: { id: true, opp_number: true, name: true } },
        assigned_to: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
      },
      orderBy: { scheduled_at: "asc" },
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
      followUps={followUps}
      users={users}
      isManagerOrAdmin={isManagerOrAdmin}
      isAdmin={isAdmin}
      currentUserId={session?.user.id ?? ""}
    />
  );
}
