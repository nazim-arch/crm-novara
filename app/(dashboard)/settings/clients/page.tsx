import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ClientManagementClient } from "@/components/settings/ClientManagementClient";

export default async function ClientsSettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "Admin") {
    redirect("/dashboard/crm");
  }

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      industry: true,
      contact_person: true,
      contact_email: true,
      contact_phone: true,
      notes: true,
      is_active: true,
      created_at: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Clients</h1>
        <p className="text-sm text-muted-foreground">Manage clients that can be tagged to tasks</p>
      </div>
      <ClientManagementClient
        initialClients={clients.map((c) => ({ ...c, created_at: c.created_at.toISOString() }))}
      />
    </div>
  );
}
