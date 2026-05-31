import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getApiKey } from "@/lib/intentradar/db";
import { startOfDay, endOfDay, subDays, differenceInCalendarDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PipelineInsight {
  narrative: string;
  attention_items: { lead_name: string; lead_number: string; reason: string; urgency: "high" | "medium" }[];
  team_insight: string;
  health: "Healthy" | "Needs Attention" | "At Risk";
}

interface LostInsight {
  pattern_summary: string;
  top_patterns: { pattern: string; count: number; example: string }[];
  opportunity_insight: string;
  re_engagement_candidates: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCr(val: unknown): string {
  if (val == null) return "unknown";
  const n = Number(val);
  if (isNaN(n)) return "unknown";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function cleanJson(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function callClaude(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error("Claude API error:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? null;
  } catch (err) {
    console.error("Claude call failed:", err);
    return null;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["Admin", "Manager"].includes(session.user.role ?? ""))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json() as { date_from?: string; date_to?: string; agent_id?: string };
    const dateFrom = body.date_from ? startOfDay(new Date(body.date_from)) : startOfDay(subDays(new Date(), 29));
    const dateTo = body.date_to ? endOfDay(new Date(body.date_to)) : endOfDay(new Date());
    const agentId = body.agent_id && body.agent_id !== "all" ? body.agent_id : null;

    const sevenDaysAgo = subDays(new Date(), 7);
    const now = new Date();

    // ── DB queries ────────────────────────────────────────────────────────────

    const [
      linkStageGroups,
      unlinkedStageGroups,
      temperatureGroups,
      staleLeads,
      overdueCount,
      activityByActor,
      actorNames,
      lostLeads,
      winsInRange,
    ] = await Promise.all([
      // 1. Stage counts from LeadOpportunity (per-deal, the pipeline unit)
      prisma.leadOpportunity.groupBy({
        by: ["status"],
        where: { lead: { deleted_at: null, ...(agentId ? { assigned_to_id: agentId } : {}) } },
        _count: { id: true },
      }),

      // 2. Stage counts for unlinked leads
      prisma.lead.groupBy({
        by: ["status"],
        where: { deleted_at: null, opportunities: { none: {} }, ...(agentId ? { assigned_to_id: agentId } : {}) },
        _count: { id: true },
      }),

      // 3. Temperature counts (still per-lead — temperature is a contact attribute)
      prisma.lead.groupBy({
        by: ["temperature"],
        where: {
          deleted_at: null,
          status: { notIn: ["Won", "Lost", "InvalidLead"] },
          ...(agentId ? { assigned_to_id: agentId } : {}),
        },
        _count: { id: true },
      }),

      // 2. Stale active leads
      prisma.lead.findMany({
        where: {
          deleted_at: null,
          status: { notIn: ["Won", "Lost", "InvalidLead", "OnHold"] },
          ...(agentId ? { assigned_to_id: agentId } : {}),
          OR: [
            { last_contact_date: null },
            { last_contact_date: { lt: sevenDaysAgo } },
          ],
        },
        select: {
          id: true, full_name: true, lead_number: true, status: true, temperature: true,
          last_contact_date: true, alternate_requirement: true,
          assigned_to: { select: { name: true } },
        },
        orderBy: [{ temperature: "asc" }, { last_contact_date: "asc" }],
        take: 15,
      }),

      // 3. Overdue follow-ups count
      prisma.followUp.count({
        where: {
          completed_at: null,
          scheduled_at: { lt: now },
          ...(agentId ? { assigned_to_id: agentId } : {}),
        },
      }),

      // 4. Team activity counts in date range
      prisma.activity.groupBy({
        by: ["actor_id"],
        where: {
          entity_type: "Lead",
          created_at: { gte: dateFrom, lte: dateTo },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),

      // 5. Actor names for activity groups
      prisma.user.findMany({
        where: { is_active: true },
        select: { id: true, name: true },
      }),

      // 6. Lost / not-interested leads in range
      prisma.lead.findMany({
        where: {
          deleted_at: null,
          ...(agentId ? { assigned_to_id: agentId } : {}),
          OR: [
            { status: "Lost", updated_at: { gte: dateFrom, lte: dateTo } },
            { activity_stage: "NotInterested", updated_at: { gte: dateFrom, lte: dateTo } },
          ],
        },
        select: {
          full_name: true, lost_reason: true, lost_notes: true,
          alternate_requirement: true, reason_not_interested: true,
          budget_min: true, budget_max: true, location_preference: true, property_type: true,
        },
        orderBy: { updated_at: "desc" },
        take: 50,
      }),

      // 7. Won in range
      prisma.leadStageHistory.findMany({
        where: {
          to_stage: "Won",
          changed_at: { gte: dateFrom, lte: dateTo },
        },
        select: { lead: { select: { full_name: true, lead_number: true } }, changed_at: true },
        orderBy: { changed_at: "desc" },
        take: 10,
      }),
    ]);

    // ── Build stats ───────────────────────────────────────────────────────────

    // Temperature counts are per-lead (contact attribute)
    const tempCounts: Record<string, number> = { Hot: 0, Warm: 0, Cold: 0, FollowUpLater: 0 };
    for (const g of temperatureGroups) {
      tempCounts[g.temperature] = (tempCounts[g.temperature] ?? 0) + g._count.id;
    }

    // Stage counts from LeadOpportunity links + unlinked leads
    const stageCounts: Record<string, number> = {};
    for (const g of linkStageGroups) {
      stageCounts[g.status] = (stageCounts[g.status] ?? 0) + g._count.id;
    }
    for (const g of unlinkedStageGroups) {
      stageCounts[g.status] = (stageCounts[g.status] ?? 0) + g._count.id;
    }

    const actorMap = new Map(actorNames.map((u) => [u.id, u.name]));
    const teamActivity = activityByActor.map((a) => ({
      name: actorMap.get(a.actor_id) ?? a.actor_id,
      count: a._count.id,
    }));

    // Sort stale leads: Hot first, then by days since last contact
    const staleWithDays = staleLeads.map((l) => ({
      ...l,
      days_stale: l.last_contact_date
        ? differenceInCalendarDays(now, l.last_contact_date)
        : null,
    }));

    // Lost reason breakdown
    const lostReasonCounts: Record<string, number> = {};
    for (const l of lostLeads) {
      const reason = l.lost_reason ?? "Other";
      lostReasonCounts[reason] = (lostReasonCounts[reason] ?? 0) + 1;
    }

    const stats = {
      temperature: tempCounts,
      stages: stageCounts,
      stale_count: staleLeads.length,
      overdue_followups: overdueCount,
      won_count: winsInRange.length,
      lost_count: lostLeads.length,
      lost_reason_breakdown: lostReasonCounts,
    };

    // ── Claude API key ────────────────────────────────────────────────────────

    const apiKey = await getApiKey("claude");
    if (!apiKey) {
      return NextResponse.json({
        stats,
        stale_leads: staleWithDays,
        lost_leads: lostLeads,
        team_activity: teamActivity,
        wins: winsInRange,
        pipeline_insight: null,
        lost_insight: null,
        ai_unavailable: true,
      });
    }

    // ── Build prompts ─────────────────────────────────────────────────────────

    const SYSTEM = `You are a real estate CRM assistant for an Indian property sales team. Analyze the pipeline data and return ONLY valid JSON — no prose, no markdown fences.`;

    const pipelinePrompt = `Pipeline snapshot (${dateFrom.toLocaleDateString("en-IN")} – ${dateTo.toLocaleDateString("en-IN")}):

Temperature: Hot(${tempCounts.Hot}) Warm(${tempCounts.Warm}) Cold(${tempCounts.Cold})
Stage breakdown: ${Object.entries(stageCounts).map(([s, c]) => `${s}:${c}`).join(", ")}
Stale leads (7+ days no contact): ${staleWithDays.length}
${staleWithDays.slice(0, 10).map((l) => `  - ${l.full_name} [${l.status}, ${l.temperature}] ${l.days_stale != null ? `${l.days_stale}d silent` : "never contacted"} — Agent: ${l.assigned_to.name}`).join("\n")}
Overdue follow-ups: ${overdueCount}
Won this period: ${winsInRange.map((w) => w.lead?.full_name).filter(Boolean).join(", ") || "none"}
Team activity (lead actions in period):
${teamActivity.map((t) => `  ${t.name}: ${t.count} actions`).join("\n") || "  (no data)"}

Return JSON:
{
  "narrative": "2-3 sentence pipeline health summary mentioning the most urgent issue",
  "attention_items": [{"lead_name":"","lead_number":"","reason":"","urgency":"high|medium"}],
  "team_insight": "1 sentence on team activity pattern or imbalance",
  "health": "Healthy|Needs Attention|At Risk"
}`;

    const lostPrompt = lostLeads.length === 0 ? null : `${lostLeads.length} leads dropped (Lost or Not Interested) between ${dateFrom.toLocaleDateString("en-IN")} and ${dateTo.toLocaleDateString("en-IN")}.

Lost reason breakdown: ${Object.entries(lostReasonCounts).map(([r, c]) => `${r}(${c})`).join(", ")}

Their notes, alternate requirements, and preferences (excerpts):
${lostLeads.slice(0, 40).map((l) => {
  const parts: string[] = [];
  if (l.lost_reason) parts.push(`Reason: ${l.lost_reason}`);
  if (l.budget_min || l.budget_max) parts.push(`Budget: ${fmtCr(l.budget_min)}–${fmtCr(l.budget_max)}`);
  if (l.location_preference) parts.push(`Location: ${l.location_preference}`);
  if (l.property_type) parts.push(`Type: ${l.property_type}`);
  const note = l.alternate_requirement ?? l.lost_notes ?? l.reason_not_interested ?? "";
  if (note) parts.push(`Notes: "${note.slice(0, 150)}"`);
  return `- ${l.full_name}: ${parts.join(" | ")}`;
}).join("\n")}

Return JSON:
{
  "pattern_summary": "2-3 sentence synthesis of WHY leads are leaving and what they actually want",
  "top_patterns": [{"pattern":"","count":0,"example":""}],
  "opportunity_insight": "1-2 sentences: what market gap or product-fit issue does this reveal?",
  "re_engagement_candidates": ["lead names worth reconsidering if inventory changes"]
}`;

    // ── Two Claude calls in parallel ──────────────────────────────────────────

    const [pipelineRaw, lostRaw] = await Promise.all([
      callClaude(apiKey, SYSTEM, pipelinePrompt),
      lostPrompt ? callClaude(apiKey, SYSTEM, lostPrompt) : Promise.resolve(null),
    ]);

    let pipelineInsight: PipelineInsight | null = null;
    let lostInsight: LostInsight | null = null;

    if (pipelineRaw) {
      try { pipelineInsight = JSON.parse(cleanJson(pipelineRaw)); } catch { /* skip */ }
    }
    if (lostRaw) {
      try { lostInsight = JSON.parse(cleanJson(lostRaw)); } catch { /* skip */ }
    }

    return NextResponse.json({
      stats,
      stale_leads: staleWithDays,
      lost_leads: lostLeads,
      team_activity: teamActivity,
      wins: winsInRange,
      pipeline_insight: pipelineInsight,
      lost_insight: lostInsight,
      ai_unavailable: false,
    });
  } catch (error) {
    console.error("POST /api/reports/pipeline-digest:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
