import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/rbac";
import { LeadForm } from "@/components/leads/LeadForm";

type Params = Promise<{ id: string }>;

export default async function EditLeadPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "lead:update")) {
    redirect("/leads");
  }

  const { id } = await params;

  const [lead, users, opportunities, taggedOpps] = await Promise.all([
    prisma.lead.findUnique({ where: { id, deleted_at: null } }),
    prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.opportunity.findMany({
      where: { deleted_at: null, status: "Active" },
      select: { id: true, opp_number: true, name: true, project: true, property_type: true, location: true },
      orderBy: { name: "asc" },
    }),
    prisma.leadOpportunity.findMany({
      where: { lead_id: id },
      select: { opportunity_id: true },
    }),
  ]);

  if (!lead) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Edit Lead</h1>
        <p className="text-sm text-muted-foreground font-mono">{lead.lead_number}</p>
      </div>
      <LeadForm
        users={users}
        opportunities={opportunities}
        defaultTaggedOpportunityIds={taggedOpps.map((t) => t.opportunity_id)}
        currentUserId={session.user.id}
        leadId={lead.id}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultValues={{
          full_name: lead.full_name,
          phone: lead.phone,
          email: lead.email ?? undefined,
          whatsapp: lead.whatsapp ?? undefined,
          lead_source: lead.lead_source,
          temperature: lead.temperature,
          campaign_source: lead.campaign_source ?? undefined,
          referral_source: lead.referral_source ?? undefined,
          budget_min: lead.budget_min ? Number(lead.budget_min) : undefined,
          budget_max: lead.budget_max ? Number(lead.budget_max) : undefined,
          property_type: lead.property_type ?? undefined,
          unit_type: lead.unit_type ?? undefined,
          location_preference: lead.location_preference ?? undefined,
          timeline_to_buy: lead.timeline_to_buy ?? undefined,
          purpose: lead.purpose ?? undefined,
          next_followup_date: lead.next_followup_date?.toISOString().split("T")[0] as unknown as Date | undefined,
          followup_type: lead.followup_type ?? undefined,
          reason_for_interest: lead.reason_for_interest ?? undefined,
          notes: lead.alternate_requirement ?? undefined,
          potential_lead_value: lead.potential_lead_value ? Number(lead.potential_lead_value) : undefined,
          assigned_to_id: lead.assigned_to_id,
          lead_owner_id: lead.lead_owner_id,
        }}
      />
    </div>
  );
}
