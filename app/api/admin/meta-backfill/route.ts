import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// RFC 4180 CSV parser — handles quoted fields with embedded commas and "" escapes
function parseCSV(text: string): Record<string, string>[] {
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let pos = 0;
  const n = src.length;

  function parseField(): string {
    if (pos >= n) return "";
    if (src[pos] === '"') {
      pos++;
      let val = "";
      while (pos < n) {
        if (src[pos] === '"') {
          pos++;
          if (pos < n && src[pos] === '"') { val += '"'; pos++; }
          else break;
        } else { val += src[pos++]; }
      }
      return val;
    }
    let val = "";
    while (pos < n && src[pos] !== "," && src[pos] !== "\n") val += src[pos++];
    return val;
  }

  function parseLine(): string[] {
    const fields: string[] = [];
    while (pos < n && src[pos] !== "\n") {
      fields.push(parseField());
      if (pos < n && src[pos] === ",") pos++;
    }
    if (pos < n && src[pos] === "\n") pos++;
    return fields;
  }

  const headers = parseLine();
  const rows: Record<string, string>[] = [];
  while (pos < n) {
    const fields = parseLine();
    if (fields.every((f) => f === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ""; });
    rows.push(row);
  }
  return rows;
}

// Run promise-returning functions in parallel, capped at `size` concurrent
async function batch<T>(items: T[], fn: (item: T) => Promise<unknown>, size = 50) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export type BackfillResult = {
  total: number;
  matched: number;
  created: number;
  skipped: number;
  errors: { leadgen_id: string; reason: string }[];
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "Admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "CSV file required (multipart field: file)" }, { status: 400 });
    }

    const text = await (file as File).text();
    const csvRows = parseCSV(text);
    if (csvRows.length === 0) {
      return NextResponse.json({ error: "No data rows found in CSV" }, { status: 400 });
    }

    // ── Phase 1: Pre-load all lookups in parallel (6 queries → ~100ms) ──────

    const [allLeads, existingMeta, opps, salesUsers, teamLeadUsers, adminUser, metaState] =
      await Promise.all([
        prisma.lead.findMany({ where: { deleted_at: null }, select: { id: true, phone: true, email: true, status: true, activity_stage: true } }),
        prisma.metaLead.findMany({ select: { leadgen_id: true, crm_lead_id: true } }),
        prisma.opportunity.findMany({
          where: { deleted_at: null, meta_form_ids: { isEmpty: false } },
          select: { id: true, meta_form_ids: true },
        }),
        prisma.user.findMany({ where: { role: "Sales",    is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
        prisma.user.findMany({ where: { role: "TeamLead", is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
        prisma.user.findFirst({ where: { role: "Admin",   is_active: true }, orderBy: { created_at: "asc" }, select: { id: true } }),
        prisma.metaAssignmentState.findUnique({ where: { id: 1 } }),
      ]);

    if (!adminUser) return NextResponse.json({ error: "No active Admin user found" }, { status: 500 });
    const adminId = adminUser.id;

    // Phone & email maps for O(1) lead matching
    const phoneMap = new Map<string, string>(); // normalised 10-digit → lead.id
    const emailMap = new Map<string, string>(); // lowercase email   → lead.id
    for (const lead of allLeads) {
      const norm = normalizePhone(lead.phone);
      if (norm.length >= 10) phoneMap.set(norm, lead.id);
      if (lead.email) emailMap.set(lead.email.toLowerCase().trim(), lead.id);
    }

    // Existing MetaLead map: leadgen_id → crm_lead_id (null if not yet linked)
    const metaMap = new Map(existingMeta.map((m) => [m.leadgen_id, m.crm_lead_id]));

    // form_id → opportunity_id (first match wins)
    const formOppMap = new Map<string, string>();
    for (const opp of opps) {
      for (const fid of opp.meta_form_ids) {
        if (!formOppMap.has(fid)) formOppMap.set(fid, opp.id);
      }
    }

    // Round-robin in memory — one state write at the very end
    const pool = [...salesUsers, ...teamLeadUsers];
    let rrIndex = pool.findIndex((u) => u.id === metaState?.last_assigned_user_id);
    function nextAssignee(): string {
      if (pool.length === 0) return adminId;
      rrIndex = (rrIndex + 1) % pool.length;
      return pool[rrIndex].id;
    }

    // ── Phase 2: Classify all rows (in memory, no DB) ────────────────────────

    type MatchedRow = { row: Record<string, string>; crmLeadId: string };
    type NewRow     = { row: Record<string, string>; assigneeId: string };

    const stats: BackfillResult = { total: csvRows.length, matched: 0, created: 0, skipped: 0, errors: [] };

    const toSkipIds   = new Set<string>(); // already fully linked
    const matched: MatchedRow[] = [];
    const toCreate:  NewRow[]   = [];

    // Track phones/emails seen within this CSV to avoid intra-CSV duplicates
    const csvPhones = new Set<string>();
    const csvEmails = new Set<string>();

    for (const row of csvRows) {
      const leadgenId = row.leadgen_id?.trim();
      if (!leadgenId) { stats.skipped++; continue; }

      // Already fully linked from a previous run
      if (metaMap.get(leadgenId)) { toSkipIds.add(leadgenId); stats.skipped++; continue; }

      const rawPhone  = row.phone?.trim() ?? "";
      const normPhone = normalizePhone(rawPhone);
      const email     = row.email?.trim().toLowerCase() || null;

      // Resolve CRM lead: phone → email → null
      const crmLeadId =
        (normPhone.length >= 10 ? phoneMap.get(normPhone) ?? null : null) ??
        (email ? emailMap.get(email) ?? null : null);

      if (crmLeadId) {
        matched.push({ row, crmLeadId });
        stats.matched++;
        continue;
      }

      // No CRM lead — will create one
      if (!rawPhone && !email) {
        stats.errors.push({ leadgen_id: leadgenId, reason: "No phone or email — cannot create CRM lead" });
        continue;
      }

      // Deduplicate within CSV: if another row already claimed this phone/email, skip
      const phoneDupe = normPhone.length >= 10 && csvPhones.has(normPhone);
      const emailDupe = email && csvEmails.has(email);
      if (phoneDupe || emailDupe) { stats.skipped++; continue; }

      if (normPhone.length >= 10) csvPhones.add(normPhone);
      if (email) csvEmails.add(email);

      toCreate.push({ row, assigneeId: nextAssignee() });
    }

    // ── Phase 3: Bulk upsert MetaLeads (1 query — skips existing) ────────────

    const allNewMetaRows = [
      ...matched.map(({ row }) => row),
      ...toCreate.map(({ row }) => row),
    ];

    if (allNewMetaRows.length > 0) {
      await prisma.metaLead.createMany({
        data: allNewMetaRows.map((row) => {
          let rawJson: unknown = null;
          try { rawJson = row.raw_fields ? JSON.parse(row.raw_fields) : null; } catch { /* keep null */ }
          return {
            leadgen_id:   row.leadgen_id.trim(),
            form_id:      row.form_id      || null,
            ad_id:        row.ad_id        || null,
            adset_id:     row.adset_id     || null,
            campaign_id:  row.campaign_id  || null,
            full_name:    row.full_name    || null,
            phone:        row.phone?.trim() || null,
            email:        row.email?.trim().toLowerCase() || null,
            city:         row.city         || null,
            created_time: row.created_time ? new Date(row.created_time) : null,
            raw:          rawJson as never,
          };
        }),
        skipDuplicates: true,
      });
    }

    // ── Phase 4: Bulk create new CRM leads ───────────────────────────────────

    let newLeadNumbers: string[] = [];
    let newLeadIds: Map<string, string> = new Map(); // leadgen_id → crmLeadId

    if (toCreate.length > 0) {
      // Allocate N consecutive lead numbers in a single atomic increment
      const n = toCreate.length;
      const seqResult = await prisma.$queryRaw<[{ last_val: bigint }]>`
        INSERT INTO sequence_counters (entity, last_val)
        VALUES ('LEAD', ${n}::bigint)
        ON CONFLICT (entity) DO UPDATE
          SET last_val = sequence_counters.last_val + ${n}::bigint
        RETURNING last_val
      `;
      const lastVal = Number(seqResult[0].last_val);
      newLeadNumbers = Array.from({ length: n }, (_, i) =>
        `DS-LEAD-${String(lastVal - n + 1 + i).padStart(6, "0")}`
      );

      const now = new Date();

      // Bulk insert all new leads (1 query)
      await prisma.lead.createMany({
        data: toCreate.map(({ row, assigneeId }, i) => ({
          lead_number:     newLeadNumbers[i],
          full_name:       row.full_name || "Meta Lead",
          phone:           row.phone?.trim() || `meta_${row.leadgen_id.trim()}`,
          email:           row.email?.trim().toLowerCase() || null,
          city:            row.city || null,
          lead_source:     "Meta Ads - Direct (backfill)",
          campaign_source: row.campaign_id || null,
          temperature:     "Cold",
          status:          "New",
          activity_stage:  "New",
          lead_owner_id:   assigneeId,
          assigned_to_id:  assigneeId,
          created_by_id:   adminId,
          created_at:      now,
          updated_at:      now,
        })),
        skipDuplicates: true, // guard against any remaining phone conflicts
      });

      // Fetch the IDs of the created leads (1 query)
      const createdLeads = await prisma.lead.findMany({
        where: { lead_number: { in: newLeadNumbers } },
        select: { id: true, lead_number: true },
      });
      const numberToId = new Map(createdLeads.map((l) => [l.lead_number, l.id]));

      // Build leadgen_id → crmLeadId for created rows
      for (let i = 0; i < toCreate.length; i++) {
        const leadId = numberToId.get(newLeadNumbers[i]);
        if (leadId) {
          newLeadIds.set(toCreate[i].row.leadgen_id.trim(), leadId);
          // Also update phone/email maps for downstream opportunity linking
          const norm = normalizePhone(toCreate[i].row.phone?.trim() ?? "");
          if (norm.length >= 10) phoneMap.set(norm, leadId);
          const em = toCreate[i].row.email?.trim().toLowerCase() || null;
          if (em) emailMap.set(em, leadId);
        }
      }

      stats.created = createdLeads.length;

      // Bulk create LeadStageHistory (1 query)
      const historyRows = Array.from(newLeadIds.entries()).map(([, leadId]) => ({
        lead_id:       leadId,
        to_stage:      "New" as const,
        changed_by_id: adminId,
        notes:         "Created via Meta historical backfill",
      }));
      if (historyRows.length > 0) {
        await prisma.leadStageHistory.createMany({ data: historyRows });
      }

      // Bulk create Activity logs (1 query)
      const activityRows = toCreate
        .map(({ row }, i) => {
          const leadId = newLeadIds.get(row.leadgen_id.trim());
          if (!leadId) return null;
          return {
            entity_type: "Lead" as const,
            entity_id:   leadId,
            action:      "lead_created" as const,
            actor_id:    adminId,
            metadata:    { lead_number: newLeadNumbers[i], source: "meta_backfill", leadgen_id: row.leadgen_id.trim() },
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (activityRows.length > 0) {
        await prisma.activity.createMany({ data: activityRows });
      }
    }

    // ── Phase 5: Link MetaLeads → CRM leads (batched parallel, 50 at a time) ─

    const metaLinks: { leadgen_id: string; crm_lead_id: string }[] = [
      ...matched.map(({ row, crmLeadId }) => ({ leadgen_id: row.leadgen_id.trim(), crm_lead_id: crmLeadId })),
      ...toCreate.map(({ row }) => {
        const leadId = newLeadIds.get(row.leadgen_id.trim());
        return leadId ? { leadgen_id: row.leadgen_id.trim(), crm_lead_id: leadId } : null;
      }).filter(Boolean) as { leadgen_id: string; crm_lead_id: string }[],
    ];

    await batch(metaLinks, ({ leadgen_id, crm_lead_id }) =>
      prisma.metaLead.update({ where: { leadgen_id }, data: { crm_lead_id } })
    );

    // ── Phase 6: Bulk create LeadOpportunity links (1 query) ─────────────────

    // Build a status map for existing leads so links inherit their real stage
    const leadStatusMap = new Map<string, { status: string; activity_stage: string }>(
      allLeads.map((l) => [l.id, { status: l.status, activity_stage: l.activity_stage }])
    );
    // Newly created leads start at "New" — track their IDs to distinguish from matched
    const newlyCreatedLeadIds = new Set(newLeadIds.values());

    type OppLink = { lead_id: string; opportunity_id: string; leadgen_id: string; status: string; activity_stage: string };
    const oppLinks: OppLink[] = [];

    const allProcessed: { leadgenId: string; crmLeadId: string }[] = [
      ...matched.map(({ row, crmLeadId }) => ({ leadgenId: row.leadgen_id.trim(), crmLeadId })),
      ...toCreate.map(({ row }) => {
        const leadId = newLeadIds.get(row.leadgen_id.trim());
        return leadId ? { leadgenId: row.leadgen_id.trim(), crmLeadId: leadId } : null;
      }).filter(Boolean) as { leadgenId: string; crmLeadId: string }[],
    ];

    // Build a quick map of leadgenId → row for form_id lookup
    const leadgenRowMap = new Map<string, Record<string, string>>();
    for (const { row } of [...matched, ...toCreate]) {
      leadgenRowMap.set(row.leadgen_id.trim(), row);
    }

    for (const { leadgenId, crmLeadId } of allProcessed) {
      const row = leadgenRowMap.get(leadgenId);
      const formId = row?.form_id?.trim();
      if (!formId) continue;
      const oppId = formOppMap.get(formId);
      if (!oppId) continue;
      // New leads start at "New"; matched existing leads inherit their current stage
      const stageSource = newlyCreatedLeadIds.has(crmLeadId)
        ? { status: "New", activity_stage: "New" }
        : (leadStatusMap.get(crmLeadId) ?? { status: "New", activity_stage: "New" });
      oppLinks.push({ lead_id: crmLeadId, opportunity_id: oppId, leadgen_id: leadgenId, ...stageSource });
    }

    if (oppLinks.length > 0) {
      // Bulk insert opportunity links (1 query)
      await prisma.leadOpportunity.createMany({
        data: oppLinks.map(({ lead_id, opportunity_id, status, activity_stage }) => ({
          lead_id,
          opportunity_id,
          tagged_by_id:   adminId,
          notes:          "Auto-linked via Meta historical backfill",
          status:         status         as never,
          activity_stage: activity_stage as never,
        })),
        skipDuplicates: true,
      });

      // Update MetaLead.opportunity_id (batched parallel)
      await batch(oppLinks, ({ leadgen_id, opportunity_id }) =>
        prisma.metaLead.update({ where: { leadgen_id }, data: { opportunity_id } })
      );
    }

    // ── Phase 7: Save round-robin state (1 upsert) ───────────────────────────

    if (pool.length > 0 && toCreate.length > 0) {
      await prisma.metaAssignmentState.upsert({
        where:  { id: 1 },
        create: { id: 1, last_assigned_user_id: pool[rrIndex]?.id ?? null },
        update: {         last_assigned_user_id: pool[rrIndex]?.id ?? null },
      });
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("POST /api/admin/meta-backfill:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
