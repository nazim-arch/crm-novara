import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendStageEvent } from "@/lib/meta-capi";

const CAPI_STAGES = new Set(["Contacted", "Prospect", "SiteVisitCompleted", "Won"]);

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const metaLeads = await prisma.metaLead.findMany({
    where: {
      crm_lead: {
        status:    { in: ["Contacted", "Prospect", "SiteVisitCompleted", "Won"] },
        updated_at: { gte: sevenDaysAgo },
        deleted_at: null,
      },
    },
    include: {
      crm_lead: {
        select: { id: true, status: true, email: true, phone: true,
                  full_name: true, city: true, settlement_value: true },
      },
    },
  });

  let processed = 0;
  let errors    = 0;

  for (const ml of metaLeads) {
    if (!ml.crm_lead || !CAPI_STAGES.has(ml.crm_lead.status)) continue;
    try {
      await sendStageEvent({
        leadgenId:  ml.leadgen_id,
        stage:      ml.crm_lead.status,
        email:      ml.email ?? ml.crm_lead.email    ?? undefined,
        phone:      ml.phone ?? undefined,
        firstName:  (ml.full_name ?? ml.crm_lead.full_name ?? "").split(" ")[0] || undefined,
        city:       ml.city  ?? ml.crm_lead.city     ?? undefined,
        crmLeadId:  ml.crm_lead_id                   ?? undefined,
        valueInr:   ml.crm_lead.status === "Won"
          ? Number(ml.crm_lead.settlement_value ?? 0) : undefined,
      });
      processed++;
    } catch (err) {
      console.error("[CAPI reconcile]", ml.leadgen_id, err);
      errors++;
    }
  }

  return NextResponse.json({ processed, errors });
}
