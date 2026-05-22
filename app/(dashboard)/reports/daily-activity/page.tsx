import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DailyActivityClient } from "@/components/reports/DailyActivityClient";

export default async function DailyActivityReportPage() {
  const session = await auth();
  if (!session?.user || !["Admin", "Manager"].includes(session.user.role ?? "")) {
    redirect("/dashboard/crm");
  }

  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-3 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Daily Activity Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All lead activities by your team — use this for EOD review or weekly check-ins.
        </p>
      </div>
      <DailyActivityClient users={users} />
    </div>
  );
}
