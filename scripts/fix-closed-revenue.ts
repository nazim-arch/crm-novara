import { prisma } from "../lib/prisma";

async function main() {
  const opps = await prisma.opportunity.findMany({
    where: { deleted_at: null },
    select: { id: true, name: true, closed_revenue: true },
  });

  console.log(`Checking ${opps.length} opportunities...`);

  for (const opp of opps) {
    const wonLeads = await prisma.leadOpportunity.findMany({
      where: { opportunity_id: opp.id },
      include: {
        lead: {
          select: {
            status: true,
            settlement_value: true,
            deal_commission_percent: true,
            deleted_at: true,
          },
        },
      },
    });

    const correctRevenue = wonLeads.reduce((sum, lo) => {
      if (
        lo.lead.deleted_at === null &&
        lo.lead.status === "Won" &&
        lo.lead.settlement_value !== null &&
        lo.lead.deal_commission_percent !== null
      ) {
        return sum + (Number(lo.lead.settlement_value) * Number(lo.lead.deal_commission_percent)) / 100;
      }
      return sum;
    }, 0);

    const current = Number(opp.closed_revenue ?? 0);
    if (Math.abs(current - correctRevenue) > 0.01) {
      await prisma.opportunity.update({
        where: { id: opp.id },
        data: { closed_revenue: correctRevenue },
      });
      console.log(`Fixed "${opp.name}": ${current} → ${correctRevenue}`);
    }
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
