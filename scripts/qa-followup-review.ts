/**
 * READ-ONLY — QA Follow-up Review
 * Checks current status of all 8 recommended next actions from the QA report.
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

function sep(n: number, title: string, priority: string) {
  console.log("\n" + "═".repeat(72));
  console.log(`  RECOMMENDATION ${n} [${priority}] — ${title}`);
  console.log("═".repeat(72));
}

async function main() {

  // ══════════════════════════════════════════════════════════════════════
  // REC 1 — DS-LEAD-000740 & DS-LEAD-000730 reverted to New by Arpitha
  // ══════════════════════════════════════════════════════════════════════
  sep(1, "DS-LEAD-000740 & DS-LEAD-000730 reverted to New by Arpitha", "Priority 1");

  const leads740730 = await prisma.lead.findMany({
    where: { lead_number: { in: ["DS-LEAD-000740", "DS-LEAD-000730"] }, deleted_at: null },
    include: {
      stage_history: {
        include: { changed_by: { select: { name: true, role: true } } },
        orderBy: { changed_at: "asc" },
      },
      opportunities: {
        include: { opportunity: { select: { opp_number: true } } },
      },
    },
  });

  for (const l of leads740730) {
    console.log(`\n${l.lead_number} | current status: ${l.status} / ${l.activity_stage}`);
    console.log("  LO links:");
    for (const lo of l.opportunities) {
      console.log(`    ${lo.opportunity.opp_number}: status=${lo.status} activity=${lo.activity_stage}`);
    }
    console.log("  Full stage history:");
    for (const h of l.stage_history) {
      console.log(`    ${h.changed_at.toISOString().slice(0, 16)} | ${h.from_stage ?? "—"} → ${h.to_stage} | ${h.changed_by.name} (${h.changed_by.role})`);
    }
  }

  // Also pull recent audit activities for these two leads
  const lead740730Ids = leads740730.map(l => l.id);
  const recentActivities = await prisma.activity.findMany({
    where: { entity_type: "Lead", entity_id: { in: lead740730Ids } },
    include: { actor: { select: { name: true, role: true } } },
    orderBy: { created_at: "desc" },
    take: 20,
  });
  console.log("\n  Audit activity log (all):");
  for (const a of recentActivities) {
    const meta = a.metadata as Record<string, unknown> ?? {};
    const lead = leads740730.find(l => l.id === a.entity_id);
    console.log(`    ${a.created_at.toISOString().slice(0, 16)} | ${lead?.lead_number} | ${a.action} | by ${a.actor.name} (${a.actor.role}) | meta=${JSON.stringify(meta).slice(0, 120)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // REC 2 — DS-LEAD-000177 Admin reset to New
  // ══════════════════════════════════════════════════════════════════════
  sep(2, "DS-LEAD-000177 — Admin reset to New while LO shows activity=Prospect", "Priority 1");

  const lead177 = await prisma.lead.findFirst({
    where: { lead_number: "DS-LEAD-000177", deleted_at: null },
    include: {
      stage_history: {
        include: { changed_by: { select: { name: true, role: true } } },
        orderBy: { changed_at: "asc" },
      },
      opportunities: {
        include: { opportunity: { select: { opp_number: true } } },
      },
    },
  });

  if (lead177) {
    console.log(`\nCurrent status: ${lead177.status} / ${lead177.activity_stage}`);
    console.log("LO links:");
    for (const lo of lead177.opportunities) {
      console.log(`  ${lo.opportunity.opp_number}: lo.status=${lo.status}  lo.activity=${lo.activity_stage}`);
    }
    console.log("Stage history:");
    for (const h of lead177.stage_history) {
      console.log(`  ${h.changed_at.toISOString().slice(0, 16)} | ${h.from_stage ?? "—"} → ${h.to_stage} | ${h.changed_by.name} (${h.changed_by.role})`);
    }

    const acts177 = await prisma.activity.findMany({
      where: { entity_type: "Lead", entity_id: lead177.id },
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { created_at: "desc" },
      take: 15,
    });
    console.log("Audit activities (recent first):");
    for (const a of acts177) {
      const meta = a.metadata as Record<string, unknown> ?? {};
      console.log(`  ${a.created_at.toISOString().slice(0, 16)} | ${a.action} | ${a.actor.name} (${a.actor.role}) | ${JSON.stringify(meta).slice(0, 120)}`);
    }

    // Notes
    const notes177 = await prisma.note.findMany({
      where: { entity_type: "Lead", entity_id: lead177.id },
      include: { created_by: { select: { name: true } } },
      orderBy: { created_at: "desc" },
      take: 5,
    });
    if (notes177.length > 0) {
      console.log("Notes:");
      for (const n of notes177) {
        console.log(`  ${n.created_at.toISOString().slice(0, 16)} | by ${n.created_by.name} | "${n.content.slice(0, 120)}"`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // REC 3 — backfill-opp-000007 endpoint dry-run check
  // ══════════════════════════════════════════════════════════════════════
  sep(3, "backfill-opp-000007 — pre-June-5 leads unlinked to DS-OPP-000007", "Priority 1");

  const CUTOFF = new Date("2026-06-05T00:00:00.000Z");
  const opp7 = await prisma.opportunity.findFirst({
    where: { opp_number: "DS-OPP-000007", deleted_at: null },
    select: { id: true, name: true },
  });

  if (!opp7) {
    console.log("DS-OPP-000007 not found!");
  } else {
    const unlinkedPreJune5 = await prisma.lead.findMany({
      where: {
        created_at: { lt: CUTOFF },
        deleted_at: null,
        opportunities: { none: { opportunity_id: opp7.id } },
      },
      select: { lead_number: true, status: true, activity_stage: true, lead_source: true, created_at: true },
      orderBy: { created_at: "asc" },
    });

    console.log(`\nOpportunity: ${opp7.name}`);
    console.log(`Leads created before 2026-06-05 NOT linked to DS-OPP-000007: ${unlinkedPreJune5.length}`);

    if (unlinkedPreJune5.length > 0) {
      console.log("\nSample (first 20):");
      for (const l of unlinkedPreJune5.slice(0, 20)) {
        console.log(`  ${l.lead_number} [${l.lead_source}] status=${l.status} created=${l.created_at.toISOString().slice(0, 10)}`);
      }
      if (unlinkedPreJune5.length > 20) console.log(`  ... and ${unlinkedPreJune5.length - 20} more`);
    } else {
      console.log("All pre-June-5 leads are already linked to DS-OPP-000007. No action needed.");
    }
  }

  // Also check if the backfill endpoint was run (did notes marker appear?)
  const backfillMarker = await prisma.leadOpportunity.count({
    where: { notes: "Backfilled — pre-June-5 leads linked to DS-OPP-000007" },
  });
  console.log(`\nRecords with backfill-opp-000007 marker: ${backfillMarker}`);

  // ══════════════════════════════════════════════════════════════════════
  // REC 4 — Map form IDs to other 6 opportunities
  // ══════════════════════════════════════════════════════════════════════
  sep(4, "Form IDs mapped to opportunities", "Priority 2");

  const allOpps = await prisma.opportunity.findMany({
    where: { deleted_at: null },
    select: { opp_number: true, name: true, meta_form_ids: true, status: true },
    orderBy: { created_at: "asc" },
  });

  console.log("\nOpportunity form ID configuration:");
  for (const o of allOpps) {
    const status = o.meta_form_ids.length > 0
      ? `✓ ${o.meta_form_ids.length} form(s): [${o.meta_form_ids.join(", ")}]`
      : "✗ NO form IDs mapped";
    console.log(`  ${o.opp_number} (${o.name}) [${o.status}]: ${status}`);
  }

  const oppsWithForms = allOpps.filter(o => o.meta_form_ids.length > 0).length;
  const oppsWithoutForms = allOpps.filter(o => o.meta_form_ids.length === 0).length;
  console.log(`\n  Opportunities with form IDs:    ${oppsWithForms}`);
  console.log(`  Opportunities without form IDs: ${oppsWithoutForms}`);

  // ══════════════════════════════════════════════════════════════════════
  // REC 5 — 18 New/New leads with no action
  // ══════════════════════════════════════════════════════════════════════
  sep(5, "18 New/New Meta Ads Direct leads — have they been actioned?", "Priority 2");

  const originalNewLeads = [
    "DS-LEAD-000849","DS-LEAD-000852","DS-LEAD-000855","DS-LEAD-000861",
    "DS-LEAD-000868","DS-LEAD-000871","DS-LEAD-000876","DS-LEAD-000879",
    "DS-LEAD-000960","DS-LEAD-001044","DS-LEAD-001047","DS-LEAD-001050",
    "DS-LEAD-001053","DS-LEAD-001056","DS-LEAD-001059","DS-LEAD-001062",
    "DS-LEAD-001065","DS-LEAD-001068",
  ];

  const currentStateOfNewLeads = await prisma.lead.findMany({
    where: { lead_number: { in: originalNewLeads }, deleted_at: null },
    select: {
      lead_number: true, status: true, activity_stage: true,
      _count: {
        select: {
          stage_history: true,
        },
      },
    },
    orderBy: { lead_number: "asc" },
  });

  // Check follow-ups and notes separately
  const newLeadIds = currentStateOfNewLeads.map(l => l.lead_number);
  const fullLeads = await prisma.lead.findMany({
    where: { lead_number: { in: originalNewLeads }, deleted_at: null },
    select: {
      id: true,
      lead_number: true,
      status: true,
      activity_stage: true,
      stage_history: { select: { to_stage: true } },
    },
  });

  const leadIdMap = new Map(fullLeads.map(l => [l.lead_number, l.id]));
  const allLeadIdsForNew = fullLeads.map(l => l.id);

  const [notesByNewLead, followUpsByNewLead, activitiesByNewLead] = await Promise.all([
    prisma.note.groupBy({
      by: ["entity_id"],
      where: { entity_type: "Lead", entity_id: { in: allLeadIdsForNew } },
      _count: { id: true },
    }),
    prisma.followUp.groupBy({
      by: ["lead_id"],
      where: { lead_id: { in: allLeadIdsForNew } },
      _count: { id: true },
    }),
    prisma.activity.groupBy({
      by: ["entity_id"],
      where: {
        entity_type: "Lead",
        entity_id: { in: allLeadIdsForNew },
        action: { not: "lead_created" },
      },
      _count: { id: true },
    }),
  ]);

  const notesSet = new Set(notesByNewLead.map(n => n.entity_id));
  const followUpSet = new Set(followUpsByNewLead.map(f => f.lead_id!));
  const activitySet = new Set(activitiesByNewLead.map(a => a.entity_id));

  let stillUntouched = 0;
  let nowActioned = 0;
  let progressedPipeline = 0;

  console.log(`\n${"Lead".padEnd(20)} ${"Status".padEnd(22)} ${"Activity".padEnd(24)} ${"Notes".padEnd(6)} ${"FU".padEnd(4)} ${"Acts"}`);
  console.log("─".repeat(85));

  for (const l of fullLeads.sort((a,b) => a.lead_number.localeCompare(b.lead_number))) {
    const id = l.id;
    const hasNotes = notesSet.has(id);
    const hasFU = followUpSet.has(id);
    const hasActs = activitySet.has(id);
    const progressed = l.status !== "New" || l.activity_stage !== "New";
    const pipelineProgressed = l.status !== "New";

    if (pipelineProgressed) progressedPipeline++;
    else if (progressed || hasNotes || hasFU || hasActs) nowActioned++;
    else stillUntouched++;

    const flag = pipelineProgressed ? "PROGRESSED" : (progressed || hasNotes || hasFU || hasActs) ? "ACTIONED  " : "IDLE      ";
    console.log(`${l.lead_number.padEnd(20)} ${l.status.padEnd(22)} ${l.activity_stage.padEnd(24)} ${String(hasNotes ? "Y" : "N").padEnd(6)} ${String(hasFU ? "Y" : "N").padEnd(4)} ${String(hasActs ? "Y" : "N")} ${flag}`);
  }

  console.log(`\nSummary:`);
  console.log(`  Pipeline progressed (status moved past New): ${progressedPipeline}`);
  console.log(`  Actioned but status still New:               ${nowActioned}`);
  console.log(`  Still completely idle (New/New, no activity): ${stillUntouched}`);

  // ══════════════════════════════════════════════════════════════════════
  // REC 6 — Source label consistency
  // ══════════════════════════════════════════════════════════════════════
  sep(6, "Source label consistency — Meta-origin leads", "Priority 2");

  const sourceBreakdown = await prisma.lead.groupBy({
    by: ["lead_source"],
    where: { deleted_at: null, lead_source: { contains: "Meta", mode: "insensitive" } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  console.log("\nMeta-related source labels in CRM:");
  for (const s of sourceBreakdown) {
    console.log(`  "${s.lead_source}": ${s._count.id} leads`);
  }

  // Total across all Meta sources
  const totalMetaOrigin = sourceBreakdown.reduce((sum, s) => sum + s._count.id, 0);
  console.log(`\n  Total Meta-origin leads (all labels): ${totalMetaOrigin}`);

  // Are the two sets mutually exclusive?
  const directCount = sourceBreakdown.find(s => s.lead_source === "Meta Ads - Direct")?._count.id ?? 0;
  const backfillCount = sourceBreakdown.find(s => s.lead_source === "Meta Ads - Direct (backfill)")?._count.id ?? 0;
  console.log(`  "Meta Ads - Direct" (webhook):           ${directCount}`);
  console.log(`  "Meta Ads - Direct (backfill)" (CSV):    ${backfillCount}`);

  const allSourceLabels = await prisma.lead.groupBy({
    by: ["lead_source"],
    where: { deleted_at: null },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  console.log("\n  All lead sources (for reference):");
  for (const s of allSourceLabels) {
    console.log(`    "${s.lead_source}": ${s._count.id}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // REC 7 — Drift check (sync-lead-opp-statuses dry-run equivalent)
  // ══════════════════════════════════════════════════════════════════════
  sep(7, "Drift check — would sync-lead-opp-statuses fix anything?", "Priority 3");

  const staleNow = await prisma.leadOpportunity.findMany({
    where: {
      status: "New",
      activity_stage: "New",
      lead: {
        deleted_at: null,
        OR: [{ status: { not: "New" } }, { activity_stage: { not: "New" } }],
      },
    },
    include: {
      lead: { select: { lead_number: true, status: true, activity_stage: true } },
      opportunity: { select: { opp_number: true } },
    },
  });

  console.log(`\nRecords where lo.status=New but lead.status≠New: ${staleNow.length}`);
  if (staleNow.length === 0) {
    console.log("CLEAN — No drift detected. Monitoring endpoint would return would_fix=0.");
  } else {
    console.log("ALERT — New drift found since repair:");
    for (const lo of staleNow) {
      console.log(`  ${lo.lead.lead_number}/${lo.opportunity.opp_number}: lead=${lo.lead.status}/${lo.lead.activity_stage}, lo=${lo.status}/${lo.activity_stage}`);
    }
  }

  // Also check reverse drift
  const reverseDrift = await prisma.leadOpportunity.count({
    where: {
      lead: { deleted_at: null },
      NOT: { status: { equals: prisma.leadOpportunity.fields.status as never } },
    },
  });

  // Full any-direction drift check
  const allLO = await prisma.leadOpportunity.findMany({
    where: { lead: { deleted_at: null } },
    select: {
      id: true, status: true, activity_stage: true,
      lead: { select: { lead_number: true, status: true, activity_stage: true } },
      opportunity: { select: { opp_number: true } },
    },
  });

  const anyDrift = allLO.filter(lo => lo.status !== lo.lead.status || lo.activity_stage !== lo.lead.activity_stage);
  console.log(`\nAny-direction drift (lo ≠ lead): ${anyDrift.length}`);
  if (anyDrift.length > 0) {
    for (const lo of anyDrift.slice(0, 20)) {
      console.log(`  ${lo.lead.lead_number}/${lo.opportunity.opp_number}: lead=[${lo.lead.status}/${lo.lead.activity_stage}] lo=[${lo.status}/${lo.activity_stage}]`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // REC 8 — MetaLead with no phone (leadgen_id 1021563880288251)
  // ══════════════════════════════════════════════════════════════════════
  sep(8, "MetaLead with no phone — leadgen_id 1021563880288251", "Priority 3");

  const noPhoneLead = await prisma.metaLead.findUnique({
    where: { leadgen_id: "1021563880288251" },
    include: {
      crm_lead: { select: { lead_number: true, status: true, phone: true, full_name: true } },
      opportunity: { select: { opp_number: true } },
    },
  });

  if (!noPhoneLead) {
    console.log("\nMetaLead 1021563880288251 not found in DB.");
  } else {
    console.log(`\nleadgen_id:    ${noPhoneLead.leadgen_id}`);
    console.log(`phone:         ${noPhoneLead.phone ?? "NULL — still no phone"}`);
    console.log(`email:         ${noPhoneLead.email ?? "null"}`);
    console.log(`full_name:     ${noPhoneLead.full_name ?? "null"}`);
    console.log(`form_id:       ${noPhoneLead.form_id ?? "null"}`);
    console.log(`received_at:   ${noPhoneLead.received_at.toISOString()}`);
    console.log(`crm_lead_id:   ${noPhoneLead.crm_lead_id ?? "null — NOT imported to CRM"}`);
    console.log(`opportunity:   ${noPhoneLead.opportunity?.opp_number ?? "null"}`);
    if (noPhoneLead.crm_lead) {
      console.log(`CRM Lead:      ${noPhoneLead.crm_lead.lead_number} — ${noPhoneLead.crm_lead.full_name} (status: ${noPhoneLead.crm_lead.status})`);
    }
  }

  // Total MetaLeads with no phone
  const allNoCrmMeta = await prisma.metaLead.findMany({
    where: { crm_lead_id: null },
    select: { leadgen_id: true, phone: true, email: true, full_name: true, form_id: true, received_at: true },
    orderBy: { received_at: "desc" },
  });
  console.log(`\nTotal MetaLead records with no CRM link (crm_lead_id=null): ${allNoCrmMeta.length}`);
  if (allNoCrmMeta.length > 0) {
    for (const m of allNoCrmMeta) {
      console.log(`  ${m.leadgen_id} | phone=${m.phone ?? "NONE"} | name=${m.full_name ?? "null"} | received=${m.received_at.toISOString().slice(0,10)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // FINAL STATUS SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(72));
  console.log("  FINAL STATUS SUMMARY — All 8 Recommendations");
  console.log("═".repeat(72));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
