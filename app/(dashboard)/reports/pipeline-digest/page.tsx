import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PipelineDigestClient } from "@/components/reports/PipelineDigestClient";

export default async function PipelineDigestPage() {
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
        <h1 className="text-xl font-semibold">Pipeline Intelligence Digest</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          AI-powered portfolio overview — active pipeline health and analysis of dropped leads.
        </p>
      </div>
      <PipelineDigestClient users={users} />
    </div>
  );
}
