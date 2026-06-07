import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { generateId } from "@/lib/id-generator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Strip all non-digits, keep last 10 (Indian mobile numbers)
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
      pos++; // skip opening quote
      let val = "";
      while (pos < n) {
        if (src[pos] === '"') {
          pos++;
          if (pos < n && src[pos] === '"') { val += '"'; pos++; } // escaped quote
          else break;
        } else {
          val += src[pos++];
        }
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

async function getAdminId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: "Admin", is_active: true },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  if (!admin) throw new Error("No active Admin user found");
  return admin.id;
}

// Reuses same round-robin logic as the live webhook
async function pickAssignee(adminId: string): Promise<string> {
  const [sales, teamLeads] = await Promise.all([
    prisma.user.findMany({ where: { role: "Sales", is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "TeamLead", is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
  ]);
  const pool = [...sales, ...teamLeads];
  if (pool.length === 0) return adminId;

  const state = await prisma.metaAssignmentState.upsert({
    where: { id: 1 },
    create: { id: 1, last_assigned_user_id: null },
    update: {},
  });
  const lastIdx = pool.findIndex((u) => u.id === state.last_assigned_user_id);
  const next = pool[lastIdx === -1 ? 0 : (lastIdx + 1) % pool.length];
  await prisma.metaAssignmentState.update({ where: { id: 1 }, data: { last_assigned_user_id: next.id } });
  return next.id;
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

    // ── Pre-load lookups (minimise per-row round trips) ──────────────────────

    // All active CRM leads — build phone and email Maps for O(1) lookups
    const allLeads = await prisma.lead.findMany({
      where: { deleted_at: null },
      select: { id: true, phone: true, email: true },
    });
    const phoneMap = new Map<string, string>(); // normalised last-10 → lead.id
    const emailMap = new Map<string, string>(); // lowercase email → lead.id
    for (const lead of allLeads) {
      const norm = normalizePhone(lead.phone);
      if (norm.length >= 10) phoneMap.set(norm, lead.id);
      if (lead.email) emailMap.set(lead.email.toLowerCase().trim(), lead.id);
    }

    // Existing MetaLeads — skip rows already fully linked
    const existingMeta = await prisma.metaLead.findMany({
      select: { leadgen_id: true, crm_lead_id: true },
    });
    // Mutable map — updated as we create new links during this run
    const metaMap = new Map(existingMeta.map((m) => [m.leadgen_id, m.crm_lead_id]));

    // form_id → opportunity_id (first match wins, mirrors live webhook behaviour)
    const opps = await prisma.opportunity.findMany({
      where: { deleted_at: null, meta_form_ids: { isEmpty: false } },
      select: { id: true, meta_form_ids: true },
    });
    const formOppMap = new Map<string, string>();
    for (const opp of opps) {
      for (const fid of opp.meta_form_ids) {
        if (!formOppMap.has(fid)) formOppMap.set(fid, opp.id);
      }
    }

    const adminId = await getAdminId();

    const stats: BackfillResult = { total: csvRows.length, matched: 0, created: 0, skipped: 0, errors: [] };

    // ── Process each CSV row ─────────────────────────────────────────────────

    for (const row of csvRows) {
      const leadgenId = row.leadgen_id?.trim();
      if (!leadgenId) { stats.skipped++; continue; }

      const rawPhone   = row.phone?.trim() ?? "";
      const normPhone  = normalizePhone(rawPhone);
      const email      = row.email?.trim().toLowerCase() || null;
      const formId     = row.form_id?.trim() || null;
      const createdAt  = row.created_time ? new Date(row.created_time) : null;

      let rawJson: unknown = null;
      try { rawJson = row.raw_fields ? JSON.parse(row.raw_fields) : null; } catch { /* keep null */ }

      // 1. Upsert MetaLead — idempotent on leadgen_id PK.
      //    On update: refresh attribution fields only (preserve existing crm_lead_id link).
      await prisma.metaLead.upsert({
        where: { leadgen_id: leadgenId },
        create: {
          leadgen_id:   leadgenId,
          form_id:      formId,
          ad_id:        row.ad_id    || null,
          adset_id:     row.adset_id || null,
          campaign_id:  row.campaign_id || null,
          full_name:    row.full_name || null,
          phone:        rawPhone || null,
          email:        email,
          city:         row.city || null,
          created_time: createdAt,
          raw:          rawJson as never,
        },
        update: {
          form_id:     formId,
          ad_id:       row.ad_id    || null,
          adset_id:    row.adset_id || null,
          campaign_id: row.campaign_id || null,
        },
      });

      // 2. Already fully linked — nothing more to do.
      if (metaMap.get(leadgenId)) { stats.skipped++; continue; }

      // 3. Resolve CRM lead: phone first (last-10 normalised), then email fallback.
      let crmLeadId: string | null =
        (normPhone.length >= 10 ? phoneMap.get(normPhone) ?? null : null) ??
        (email ? emailMap.get(email) ?? null : null);

      if (crmLeadId) {
        // 4a. Link MetaLead → existing CRM lead
        await prisma.metaLead.update({ where: { leadgen_id: leadgenId }, data: { crm_lead_id: crmLeadId } });
        metaMap.set(leadgenId, crmLeadId);
        stats.matched++;
      } else {
        // 4b. No CRM match — create a new lead
        if (!rawPhone && !email) {
          stats.errors.push({ leadgen_id: leadgenId, reason: "No phone or email — cannot create CRM lead" });
          continue;
        }

        try {
          const assigneeId  = await pickAssignee(adminId);
          const lead_number = await generateId("LEAD");

          const newLead = await prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
              data: {
                lead_number,
                full_name:       row.full_name || "Meta Lead",
                phone:           rawPhone || `meta_${leadgenId}`,
                email:           email,
                city:            row.city || null,
                lead_source:     "Meta Ads - Direct (backfill)",
                campaign_source: row.campaign_id || null,
                temperature:     "Cold",
                status:          "New",
                activity_stage:  "New",
                lead_owner_id:   assigneeId,
                assigned_to_id:  assigneeId,
                created_by_id:   adminId,
              },
            });

            await tx.leadStageHistory.create({
              data: {
                lead_id:       lead.id,
                to_stage:      "New",
                changed_by_id: adminId,
                notes:         "Created via Meta historical backfill",
              },
            });

            await tx.activity.create({
              data: {
                entity_type: "Lead",
                entity_id:   lead.id,
                action:      "lead_created",
                actor_id:    adminId,
                metadata:    { lead_number: lead.lead_number, source: "meta_backfill", leadgen_id: leadgenId },
              },
            });

            await tx.metaLead.update({
              where: { leadgen_id: leadgenId },
              data:  { crm_lead_id: lead.id },
            });

            return lead;
          });

          crmLeadId = newLead.id;
          // Update in-memory maps so duplicate phones later in the same CSV don't create a second lead
          if (normPhone.length >= 10) phoneMap.set(normPhone, crmLeadId);
          if (email) emailMap.set(email, crmLeadId);
          metaMap.set(leadgenId, crmLeadId);
          stats.created++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          const isDupe = msg.includes("Unique constraint") || msg.includes("unique");
          stats.errors.push({
            leadgen_id: leadgenId,
            reason: isDupe ? `Duplicate phone already in DB: ${rawPhone}` : msg,
          });
          continue;
        }
      }

      // 5. Auto-link to Opportunity via form_id (mirrors live webhook)
      if (formId && crmLeadId) {
        const oppId = formOppMap.get(formId);
        if (oppId) {
          await prisma.metaLead.update({ where: { leadgen_id: leadgenId }, data: { opportunity_id: oppId } });
          try {
            await prisma.leadOpportunity.create({
              data: {
                lead_id:        crmLeadId,
                opportunity_id: oppId,
                tagged_by_id:   adminId,
                notes:          "Auto-linked via Meta historical backfill",
              },
            });
          } catch { /* unique constraint — already linked */ }
        }
      }
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("POST /api/admin/meta-backfill:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
