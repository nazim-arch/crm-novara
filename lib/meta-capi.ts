import { createHash, createHmac } from "crypto";

const STAGE_TO_EVENT: Partial<Record<string, string>> = {
  Contacted:           "Contacted",
  Prospect:            "QualifiedLead",
  SiteVisitCompleted:  "SiteVisit",
  Won:                 "Booking",
};

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hashEmail(email: string): string {
  return sha256(email.toLowerCase().trim());
}

function hashPhone(phone: string): string {
  return sha256(phone.replace(/\D/g, ""));
}

export async function sendStageEvent(opts: {
  leadgenId: string;
  stage: string;
  email?: string;
  phone?: string;
  valueInr?: number;
  eventTimeSec?: number;
}): Promise<void> {
  const eventName = STAGE_TO_EVENT[opts.stage];
  if (!eventName) return;

  const {
    META_SYSTEM_USER_TOKEN,
    META_DATASET_ID,
    META_GRAPH_VERSION,
  } = process.env;

  if (!META_SYSTEM_USER_TOKEN || !META_DATASET_ID) {
    console.warn("[CAPI] Missing META_SYSTEM_USER_TOKEN or META_DATASET_ID — skipping");
    return;
  }

  const version = META_GRAPH_VERSION ?? "v21.0";
  const eventTime = opts.eventTimeSec ?? Math.floor(Date.now() / 1000);
  const eventId = `${opts.leadgenId}_${eventName}`;

  const userData: Record<string, unknown> = {
    lead_id: parseInt(opts.leadgenId, 10),
  };
  if (opts.email) userData.em = [hashEmail(opts.email)];
  if (opts.phone) userData.ph = [hashPhone(opts.phone)];

  const customData: Record<string, unknown> = {
    event_source:      "CRM",
    lead_event_source: "CRM",
  };
  if (eventName === "Booking" && opts.valueInr && opts.valueInr > 0) {
    customData.value    = opts.valueInr;
    customData.currency = "INR";
  }

  const payload = {
    data: [
      {
        event_name:    eventName,
        event_time:    eventTime,
        event_id:      eventId,
        action_source: "system_generated",
        user_data:     userData,
        custom_data:   customData,
      },
    ],
  };

  const url = `https://graph.facebook.com/${version}/${META_DATASET_ID}/events?access_token=${META_SYSTEM_USER_TOKEN}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[CAPI] ${res.status} ${res.statusText}: ${text}`);
  }
}

// Exposed for webhook signature verification in the inbound route
export { createHmac };
