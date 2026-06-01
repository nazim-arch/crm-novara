import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FollowUpsClient } from "@/components/follow-ups/FollowUpsClient";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const session = await auth();
  const role = session?.user.role ?? "";
  const isScoped = role === "Sales" || role === "Operations" || role === "TeamLead";
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

  const fuInclude = {
    lead: {
      select: {
        id: true,
        lead_number: true,
        full_name: true,
        status: true,
        temperature: true,
        _count: { select: { followups: true } },
      },
    },
    opportunity: { select: { id: true, opp_number: true, name: true } },
    assigned_to: { select: { id: true, name: true } },
    created_by: { select: { id: true, name: true } },
  };

  const [pendingFollowUps, users] = await Promise.all([
    prisma.followUp.findMany({
      where: { ...scopeFilter, completed_at: null },
      include: fuInclude,
      orderBy: { scheduled_at: "asc" },
    }),
    isManagerOrAdmin
      ? prisma.user.findMany({
          where: { is_active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const followUps = pendingFollowUps;

  return (
    <FollowUpsClient
      followUps={followUps}
      users={users}
      isManagerOrAdmin={isManagerOrAdmin}
      isAdmin={isAdmin}
      currentUserId={session?.user.id ?? ""}
      role={role}
      defaultTab={tab}
    />
  );
}
