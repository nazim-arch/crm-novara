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

async function linkToOpportunity(data: MetaLeadData, crmLeadId: string) {
  if (!data.form_id) return;

  const opp = await prisma.opportunity.findFirst({
    where: { meta_form_id: data.form_id, deleted_at: null },
    select: { id: true },
  });
  if (!opp) {
    console.warn(`[Meta webhook] No opportunity mapped for form_id=${data.form_id} — lead will have no opportunity link`);
    return;
  }

  const adminId = await getDefaultAdminId();
  if (!adminId) {
    console.warn("[Meta webhook] No active admin found — cannot create LeadOpportunity");
    return;
  }

  // Update MetaLead with the matched opportunity
  await prisma.metaLead.update({
    where: { leadgen_id: data.leadgen_id },
    data: { opportunity_id: opp.id },
  });

  // Create the LeadOpportunity link (skip if already exists)
  try {
    await prisma.leadOpportunity.create({
      data: {
        lead_id:       crmLeadId,
        opportunity_id: opp.id,
        tagged_by_id:  adminId,
        notes:         "Auto-linked via Meta Lead Ads webhook",
      },
    });
  } catch {
    // Unique constraint violation — link already exists, safe to ignore
  }
}

async function autoImportToCRM(data: MetaLeadData): Promise<string | null> {
  // 1. Check if already linked
  const existing = await prisma.metaLead.findUnique({
    where: { leadgen_id: data.leadgen_id },
    select: { crm_lead_id: true },
  });
  if (existing?.crm_lead_id) return existing.crm_lead_id;

  // 2. Phone is required to create a CRM lead
  if (!data.phone) {
    console.warn(`[Meta webhook] No phone for leadgen_id=${data.leadgen_id} — skipping CRM import`);
    return null;
  }

  const adminId = await getDefaultAdminId();
  if (!adminId) {
    console.warn("[Meta webhook] No active admin — cannot create CRM lead");
    return null;
  }

  // 3. Phone dedup — link to existing lead instead of creating a duplicate
  const existingLead = await prisma.lead.findFirst({
    where: { phone: data.phone, deleted_at: null },
    select: { id: true },
  });

  if (existingLead) {
    await prisma.metaLead.update({
      where: { leadgen_id: data.leadgen_id },
      data: { crm_lead_id: existingLead.id },
    });
    return existingLead.id;
  }

  // 4. Create a new CRM lead
  const lead_number = await generateId("LEAD");

  const lead = await prisma.$transaction(async (tx) => {
    const newLead = await tx.lead.create({
      data: {
        lead_number,
        full_name:      data.full_name ?? "Meta Lead",
        phone:          data.phone!,
        email:          data.email ?? null,
        city:           data.city ?? null,
        lead_source:    "Meta Ads - Direct",
        campaign_source: data.campaign_id ?? null,
        temperature:    "Cold",
        status:         "New",
        activity_stage: "New",
        lead_owner_id:  adminId,
        assigned_to_id: adminId,
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

    await tx.metaLead.update({
      where: { leadgen_id: data.leadgen_id },
      data:  { crm_lead_id: newLead.id },
    });

    return newLead;
  });

  return lead.id;
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
        const leadData  = await fetchLead(leadgenId);
        await upsertMetaLead(leadData);
        const crmLeadId = await autoImportToCRM(leadData);
        if (crmLeadId) await linkToOpportunity(leadData, crmLeadId);
      } catch (err) {
        console.error(`[Meta webhook] Error processing leadgen_id=${leadgenId}:`, err);
        // Do not re-throw — always return 200 to Meta or it will retry indefinitely
      }
    }
  }

  return new Response("ok", { status: 200 });
}
