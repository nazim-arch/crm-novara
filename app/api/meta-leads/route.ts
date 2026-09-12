import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/id-generator";

export const runtime = "nodejs";

// ─── Module-level caches (survive warm serverless invocations) ──────────────

let cachedPageToken: string | null = null;
let cachedAdminId: string | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getPageToken(): Promise<string> {
  if (cachedPageToken) return cachedPageToken;

  const { META_SYSTEM_USER_TOKEN, META_PAGE_ID, META_GRAPH_VERSION } = process.env;
  if (!META_SYSTEM_USER_TOKEN || !META_PAGE_ID) {
    throw new Error("[Meta webhook] Missing META_SYSTEM_USER_TOKEN or META_PAGE_ID");
  }
  const version = META_GRAPH_VERSION ?? "v21.0";
  const url = `https://graph.facebook.com/${version}/${META_PAGE_ID}?fields=access_token&access_token=${META_SYSTEM_USER_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[Meta webhook] Page token fetch failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("[Meta webhook] No access_token in page token response");
  cachedPageToken = json.access_token;
  return cachedPageToken;
}

function fieldVal(fieldData: { name: string; values: string[] }[], name: string): string | undefined {
  return fieldData.find((f) => f.name === name)?.values?.[0];
}

async function fetchLead(leadgenId: string): Promise<{
  leadgen_id: string;
  created_time?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  raw: Record<string, unknown>;
}> {
  const pageToken = await getPageToken();
  const version = process.env.META_GRAPH_VERSION ?? "v21.0";
  const url = `https://graph.facebook.com/${version}/${leadgenId}?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id&access_token=${pageToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[Meta webhook] Lead fetch failed for ${leadgenId}: ${res.status}`);
  const raw = (await res.json()) as {
    id: string;
    field_data?: { name: string; values: string[] }[];
    created_time?: string;
    ad_id?: string;
    adset_id?: string;
    campaign_id?: string;
    form_id?: string;
  };

  const fd = raw.field_data ?? [];
  return {
    leadgen_id:   leadgenId,
    created_time: raw.created_time,
    ad_id:        raw.ad_id,
    adset_id:     raw.adset_id,
    campaign_id:  raw.campaign_id,
    form_id:      raw.form_id,
    full_name:    fieldVal(fd, "full_name"),
    phone:        fieldVal(fd, "phone") ?? fieldVal(fd, "phone_number"),
    email:        fieldVal(fd, "email"),
    city:         fieldVal(fd, "city"),
    raw:          raw as Record<string, unknown>,
  };
}

async function getDefaultAdminId(): Promise<string | null> {
  if (cachedAdminId) return cachedAdminId;
  const admin = await prisma.user.findFirst({
    where: { role: "Admin", is_active: true },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  cachedAdminId = admin?.id ?? null;
  return cachedAdminId;
}

// Round-robin: Sales (A→Z) then TeamLead (A→Z), state persisted in meta_assignment_state
async function pickNextAssignee(): Promise<string | null> {
  const [salesUsers, teamLeadUsers] = await Promise.all([
    prisma.user.findMany({ where: { role: "Sales", is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "TeamLead", is_active: true }, select: { id: true }, orderBy: { name: "asc" } }),
  ]);

  const pool = [...salesUsers, ...teamLeadUsers];
  if (pool.length === 0) return getDefaultAdminId();

  const state = await prisma.metaAssignmentState.upsert({
    where: { id: 1 },
    create: { id: 1, last_assigned_user_id: null },
    update: {},
  });

  const lastIndex = pool.findIndex((u) => u.id === state.last_assigned_user_id);
  const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % pool.length;
  const next = pool[nextIndex];

  await prisma.metaAssignmentState.update({
    where: { id: 1 },
    data: { last_assigned_user_id: next.id },
  });

  return next.id;
}

type MetaLeadData = Awaited<ReturnType<typeof fetchLead>>;

async function upsertMetaLead(data: MetaLeadData) {
  await prisma.metaLead.upsert({
    where: { leadgen_id: data.leadgen_id },
    create: {
      leadgen_id:   data.leadgen_id,
      created_time: data.created_time ? new Date(data.created_time) : null,
      ad_id:        data.ad_id ?? null,
      adset_id:     data.adset_id ?? null,
      campaign_id:  data.campaign_id ?? null,
      form_id:      data.form_id ?? null,
      full_name:    data.full_name ?? null,
      phone:        data.phone ?? null,
      email:        data.email ?? null,
      city:         data.city ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw:          data.raw as any,
    },
    update: {}, // idempotent — don't overwrite on duplicate delivery
  });
}

// Resolve the CRM opportunity a Meta form maps to (null = form not mapped to any opportunity).
async function resolveOpportunity(formId: string | null | undefined): Promise<string | null> {
  if (!formId) return null;
  const opp = await prisma.opportunity.findFirst({
    where: { meta_form_ids: { has: formId }, deleted_at: null },
    select: { id: true },
  });
  return opp?.id ?? null;
}

// Idempotently link a CRM lead to an opportunity. One person (lead) can carry multiple opportunity
// links, each with its own pipeline stage — so a second submission for a DIFFERENT opportunity adds a
// new link (a new row), while a repeat for the SAME opportunity is a no-op.
async function ensureOppLink(crmLeadId: string, opportunityId: string, leadgenId: string) {
  const adminId = await getDefaultAdminId();
  if (!adminId) {
    console.warn("[Meta webhook] No active admin found — cannot create LeadOpportunity");
    return;
  }

  // Unique on (lead_id, opportunity_id): if a link already exists (even if previously untagged),
  // treat it as linked. Meta integration is a one-time action per lead+opportunity pair.
  const alreadyLinked = await prisma.leadOpportunity.findUnique({
    where: { lead_id_opportunity_id: { lead_id: crmLeadId, opportunity_id: opportunityId } },
    select: { id: true },
  });
  if (alreadyLinked) {
    console.log(`[Meta webhook] Lead ${crmLeadId} already linked to opp ${opportunityId} — skipping duplicate link`);
    return;
  }

  // Record the matched opportunity on the MetaLead, then create the link.
  // status and activity_stage intentionally default to "New" — new opportunity tracking starts fresh.
  await prisma.metaLead.update({
    where: { leadgen_id: leadgenId },
    data:  { opportunity_id: opportunityId },
  });
  await prisma.leadOpportunity.create({
    data: {
      lead_id:        crmLeadId,
      opportunity_id: opportunityId,
      tagged_by_id:   adminId,
      notes:          "Auto-linked via Meta Lead Ads webhook",
    },
  });
}

// Create a brand-new CRM lead from a Meta submission. `unmapped` = the form maps to no opportunity, so
// the lead is left unlinked and flagged with a `meta_form_unmapped` Activity for an admin to map later.
async function createCrmLead(data: MetaLeadData, opts: { unmapped: boolean }): Promise<string | null> {
  const [adminId, assigneeId] = await Promise.all([getDefaultAdminId(), pickNextAssignee()]);
  if (!adminId) {
    console.warn("[Meta webhook] No active admin — cannot create CRM lead");
    return null;
  }
  const effectiveAssigneeId = assigneeId ?? adminId;
  const lead_number = await generateId("LEAD");

  const lead = await prisma.$transaction(async (tx) => {
    const newLead = await tx.lead.create({
      data: {
        lead_number,
        full_name:      data.full_name ?? "Meta Lead",
        phone:          data.phone!,
        email:          data.email ?? null,
        city:           data.city ?? null,
        lead_source:    opts.unmapped ? "Meta Ads - Unmapped Form" : "Meta Ads - Direct",
        campaign_source: data.campaign_id ?? null,
        temperature:    "Cold",
        status:         "New",
        activity_stage: "New",
        lead_owner_id:  effectiveAssigneeId,
        assigned_to_id: effectiveAssigneeId,
        created_by_id:  adminId,
      },
    });

    await tx.leadStageHistory.create({
      data: { lead_id: newLead.id, to_stage: "New", changed_by_id: adminId, notes: "Lead created via Meta Lead Ads webhook" },
    });

    await tx.activity.create({
      data: {
        entity_type: "Lead",
        entity_id:   newLead.id,
        action:      "lead_created",
        actor_id:    adminId,
        metadata:    { lead_number: newLead.lead_number, source: "Meta Lead Ads webhook" },
      },
    });

    // Flag unmapped-form leads so an admin can find them and map the form to an opportunity.
    if (opts.unmapped) {
      await tx.activity.create({
        data: {
          entity_type: "Lead",
          entity_id:   newLead.id,
          action:      "meta_form_unmapped",
          actor_id:    adminId,
          metadata:    { leadgen_id: data.leadgen_id, form_id: data.form_id ?? null, campaign_id: data.campaign_id ?? null },
        },
      });
    }

    await tx.metaLead.update({
      where: { leadgen_id: data.leadgen_id },
      data:  { crm_lead_id: newLead.id },
    });

    return newLead;
  });

  return lead.id;
}

// Orchestrates import + opportunity linkage for one Meta submission.
// - MAPPED form: one Lead per person (phone). Reuse the existing lead if the phone is known and add an
//   opportunity link; a link for a NEW opportunity becomes a new row, a repeat for the same opportunity
//   is a no-op. Create the lead if the phone is new.
// - UNMAPPED form: never silently drop. Dedup only on (phone + form_id) to avoid resubmission spam;
//   otherwise create a NEW, UNLINKED lead flagged for an admin to map the form.
async function importAndLink(data: MetaLeadData): Promise<void> {
  // Phone is required to create or dedup a CRM lead.
  if (!data.phone) {
    console.warn(`[Meta webhook] No phone for leadgen_id=${data.leadgen_id} — skipping CRM import`);
    return;
  }

  const existing = await prisma.metaLead.findUnique({
    where:  { leadgen_id: data.leadgen_id },
    select: { crm_lead_id: true },
  });

  const opportunityId = await resolveOpportunity(data.form_id);

  // Redelivery of an already-imported submission: just make sure the opportunity link exists.
  if (existing?.crm_lead_id) {
    if (opportunityId) await ensureOppLink(existing.crm_lead_id, opportunityId, data.leadgen_id);
    return;
  }

  if (opportunityId) {
    // Mapped form — one Lead per phone, then ensure the opportunity link (adds a row for a new opp).
    const existingLead = await prisma.lead.findFirst({
      where:  { phone: data.phone, deleted_at: null },
      select: { id: true },
    });

    let crmLeadId: string | null;
    if (existingLead) {
      await prisma.metaLead.update({
        where: { leadgen_id: data.leadgen_id },
        data:  { crm_lead_id: existingLead.id },
      });
      crmLeadId = existingLead.id;
    } else {
      crmLeadId = await createCrmLead(data, { unmapped: false });
    }

    if (crmLeadId) await ensureOppLink(crmLeadId, opportunityId, data.leadgen_id);
    return;
  }

  // Unmapped form — dedup only within the same form to avoid duplicate leads from resubmissions.
  const priorSameForm = await prisma.metaLead.findFirst({
    where: {
      phone:       data.phone,
      form_id:     data.form_id ?? null,
      crm_lead_id: { not: null },
      leadgen_id:  { not: data.leadgen_id },
    },
    select:  { crm_lead_id: true },
    orderBy: { received_at: "asc" },
  });

  if (priorSameForm?.crm_lead_id) {
    await prisma.metaLead.update({
      where: { leadgen_id: data.leadgen_id },
      data:  { crm_lead_id: priorSameForm.crm_lead_id },
    });
    return;
  }

  await createCrmLead(data, { unmapped: true });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode        = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge   = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify HMAC-SHA256 signature
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected  = `sha256=${createHmac("sha256", process.env.META_APP_SECRET ?? "").update(rawBody).digest("hex")}`;

  if (!signature || signature !== expected) {
    console.warn("[Meta webhook] Signature mismatch");
    return new Response("Forbidden", { status: 403 });
  }

  let payload: {
    entry?: { changes?: { field: string; value?: { leadgen_id?: string } }[] }[];
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;

      const leadgenId = change.value.leadgen_id;
      try {
        const leadData = await fetchLead(leadgenId);
        await upsertMetaLead(leadData);
        await importAndLink(leadData);
      } catch (err) {
        console.error(`[Meta webhook] Error processing leadgen_id=${leadgenId}:`, err);
        // Do not re-throw — always return 200 to Meta or it will retry indefinitely
      }
    }
  }

  return new Response("ok", { status: 200 });
}
