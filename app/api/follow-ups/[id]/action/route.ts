import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createLeadReviewEvent } from "@/lib/lead-review-events";
import { notifyLeadWon, notifyLeadLost, notifyLeadStageChanged } from "@/lib/email-notifications";

type Params = Promise<{ id: string }>;

const FOLLOW_UP_TYPES = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"] as const;
const PIPELINE_STAGES = ["New", "Prospect", "SiteVisitCompleted", "Negotiation", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"] as const;
const TEMPERATURES = ["Hot", "Warm", "Cold", "FollowUpLater"] as const;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("log_attempt"), channel: z.enum(["Call", "WhatsApp", "Email"]) }),

  z.object({
    action: z.literal("contacted"),
    outcome: z.string().min(1),
    notes: z.string().optional(),
    temperature: z.enum(TEMPERATURES).optional(),
    to_stage: z.enum(PIPELINE_STAGES).optional(),
    next_followup_date: z.string().optional(),
    next_followup_type: z.enum(FOLLOW_UP_TYPES).optional(),
  }),

  z.object({
    action: z.literal("no_response"),
    notes: z.string().min(1),
    sub_action: z.enum(["callback_today", "schedule_next", "mark_unreachable"]),
    callback_time: z.string().optional(),
    next_followup_date: z.string().optional(),
    next_followup_type: z.enum(FOLLOW_UP_TYPES).optional(),
  }),

  z.object({
    action: z.literal("callback_today"),
    callback_time: z.string().min(1),
    notes: z.string().optional(),
  }),

  z.object({
    action: z.literal("schedule_next"),
    next_date: z.string().min(1),
    next_time: z.string().optional(),
    next_type: z.enum(FOLLOW_UP_TYPES),
    notes: z.string().optional(),
  }),

  z.object({ action: z.literal("update_notes"), notes: z.string().min(1) }),

  z.object({
    action: z.literal("update_stage"),
    to_stage: z.enum(PIPELINE_STAGES),
    notes: z.string().min(1),
  }),

  z.object({
    action: z.literal("mark_lost"),
    lost_reason: z.string().min(1),
    notes: z.string().min(1),
    lost_notes: z.string().optional(),
  }),

  z.object({
    action: z.literal("mark_won"),
    notes: z.string().min(1),
    settlement_value: z.number().positive().optional(),
    deal_commission_percent: z.number().min(0).max(100).optional(),
  }),

  z.object({
    action: z.literal("site_visit_done"),
    notes: z.string().min(1),
    next_followup_date: z.string().optional(),
    next_followup_type: z.enum(FOLLOW_UP_TYPES).optional(),
  }),
]);

export async function POST(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const fu = await prisma.followUp.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true, lead_number: true, full_name: true, status: true,
            temperature: true, assigned_to_id: true, potential_lead_value: true,
            settlement_value: true, deal_commission_percent: true,
          },
        },
      },
    });
    if (!fu) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const data = parsed.data;
    const userId = session.user.id;
    const leadId = fu.lead_id;

    // ── log_attempt ───────────────────────────────────────────────────────────
    if (data.action === "log_attempt") {
      const updated = await prisma.followUp.update({
        where: { id },
        data: { attempt_count: { increment: 1 } },
      });
      if (leadId) {
        await prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId,
            action: `attempt_${data.channel.toLowerCase()}`,
            actor_id: userId,
            metadata: { channel: data.channel },
          },
        });
        await prisma.lead.update({
          where: { id: leadId },
          data: { last_contact_date: now },
        });
      }
      return NextResponse.json({ data: updated });
    }

    // ── contacted ─────────────────────────────────────────────────────────────
    if (data.action === "contacted") {
      const fuUpdate = await prisma.followUp.update({
        where: { id },
        data: { completed_at: now, outcome: data.outcome, notes: data.notes ?? fu.notes, attempt_count: { increment: 1 } },
      });

      if (leadId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leadData: Record<string, any> = { last_contact_date: now, updated_at: now };
        if (data.temperature) leadData.temperature = data.temperature;
        if (data.to_stage && data.to_stage !== fu.lead?.status) {
          leadData.status = data.to_stage;
        }
        await prisma.lead.update({ where: { id: leadId }, data: leadData });

        if (data.to_stage && data.to_stage !== fu.lead?.status) {
          await prisma.leadStageHistory.create({
            data: { lead_id: leadId, from_stage: fu.lead!.status, to_stage: data.to_stage, changed_by_id: userId, notes: data.notes },
          });
        }
        await prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId,
            action: "followup_completed",
            actor_id: userId,
            metadata: { outcome: data.outcome, notes: data.notes ?? null, stage_change: data.to_stage ?? null },
          },
        });

        if (data.next_followup_date && data.next_followup_type) {
          const nextDate = new Date(data.next_followup_date);
          await prisma.followUp.create({
            data: {
              lead_id: leadId,
              type: data.next_followup_type,
              priority: fu.priority,
              scheduled_at: nextDate,
              created_by_id: userId,
              assigned_to_id: fu.assigned_to_id,
            },
          });
          await prisma.lead.update({
            where: { id: leadId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { next_followup_date: nextDate, followup_type: data.next_followup_type as any },
          });
        } else {
          const nextFu = await prisma.followUp.findFirst({
            where: { lead_id: leadId, completed_at: null },
            orderBy: { scheduled_at: "asc" },
          });
          await prisma.lead.update({
            where: { id: leadId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { next_followup_date: nextFu?.scheduled_at ?? null, followup_type: (nextFu?.type ?? null) as any },
          });
        }

        createLeadReviewEvent({
          lead_id: leadId, triggered_by_id: userId, trigger_type: "FieldUpdated",
          trigger_context: { outcome: data.outcome, stage_to: data.to_stage ?? null, temp_to: data.temperature ?? null },
        });
      }
      return NextResponse.json({ data: fuUpdate, action: "contacted" });
    }

    // ── no_response ──────────────────────────────────────────────────────────
    if (data.action === "no_response") {
      if (data.sub_action === "callback_today") {
        const callbackAt = data.callback_time ? new Date(data.callback_time) : new Date(now.getTime() + 60 * 60 * 1000);
        const updated = await prisma.followUp.update({
          where: { id },
          data: {
            callback_at: callbackAt,
            notes: data.notes,
            attempt_count: { increment: 1 },
            no_response_count: { increment: 1 },
          },
        });
        if (leadId) {
          await prisma.activity.create({
            data: {
              entity_type: "Lead", entity_id: leadId, action: "no_response",
              actor_id: userId,
              metadata: { notes: data.notes, callback_at: callbackAt.toISOString() },
            },
          });
        }
        return NextResponse.json({ data: updated, action: "callback_today" });
      }

      if (data.sub_action === "schedule_next") {
        const nextDate = data.next_followup_date ? new Date(data.next_followup_date) : null;
        const fuUpdate = await prisma.followUp.update({
          where: { id },
          data: { completed_at: now, outcome: "No Response", notes: data.notes, attempt_count: { increment: 1 }, no_response_count: { increment: 1 } },
        });
        if (leadId && nextDate && data.next_followup_type) {
          await prisma.followUp.create({
            data: {
              lead_id: leadId, type: data.next_followup_type, priority: fu.priority,
              scheduled_at: nextDate, created_by_id: userId, assigned_to_id: fu.assigned_to_id,
            },
          });
          await prisma.lead.update({
            where: { id: leadId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { next_followup_date: nextDate, followup_type: data.next_followup_type as any },
          });
        }
        if (leadId) {
          await prisma.activity.create({
            data: {
              entity_type: "Lead", entity_id: leadId, action: "no_response",
              actor_id: userId,
              metadata: { notes: data.notes, next_followup: nextDate?.toISOString() ?? null },
            },
          });
        }
        return NextResponse.json({ data: fuUpdate, action: "completed" });
      }

      // mark_unreachable
      const fuUpdate = await prisma.followUp.update({
        where: { id },
        data: { completed_at: now, outcome: "Not Reachable", notes: data.notes, attempt_count: { increment: 1 }, no_response_count: { increment: 1 } },
      });
      if (leadId) {
        await prisma.lead.update({ where: { id: leadId }, data: { activity_stage: "Unreachable" } });
        await prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId, action: "marked_unreachable",
            actor_id: userId, metadata: { notes: data.notes },
          },
        });
      }
      return NextResponse.json({ data: fuUpdate, action: "completed" });
    }

    // ── callback_today ────────────────────────────────────────────────────────
    if (data.action === "callback_today") {
      const callbackAt = new Date(data.callback_time);
      const updated = await prisma.followUp.update({
        where: { id },
        data: {
          callback_at: callbackAt,
          notes: data.notes ? `${fu.notes ? fu.notes + "\n" : ""}${data.notes}` : fu.notes,
          attempt_count: { increment: 1 },
        },
      });
      if (leadId) {
        await prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId, action: "callback_scheduled",
            actor_id: userId,
            metadata: { callback_at: callbackAt.toISOString(), notes: data.notes ?? null },
          },
        });
      }
      return NextResponse.json({ data: updated, action: "callback_today" });
    }

    // ── schedule_next ─────────────────────────────────────────────────────────
    if (data.action === "schedule_next") {
      const nextDateStr = data.next_time
        ? data.next_date + "T" + data.next_time
        : data.next_date + "T09:00:00";
      const nextDate = new Date(nextDateStr);

      const fuUpdate = await prisma.followUp.update({
        where: { id },
        data: { completed_at: now, outcome: "Next Follow-up Scheduled", notes: data.notes ?? fu.notes },
      });

      if (leadId) {
        await prisma.followUp.create({
          data: {
            lead_id: leadId, type: data.next_type, priority: fu.priority,
            scheduled_at: nextDate, created_by_id: userId, assigned_to_id: fu.assigned_to_id,
          },
        });
        await prisma.lead.update({
          where: { id: leadId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { next_followup_date: nextDate, followup_type: data.next_type as any },
        });
        createLeadReviewEvent({
          lead_id: leadId, triggered_by_id: userId, trigger_type: "FollowUpAdded",
          trigger_context: { followup_type: data.next_type, scheduled_at: nextDate.toISOString() },
        });
      }
      return NextResponse.json({ data: fuUpdate, action: "completed" });
    }

    // ── update_notes ──────────────────────────────────────────────────────────
    if (data.action === "update_notes") {
      const updated = await prisma.followUp.update({
        where: { id }, data: { notes: data.notes },
      });
      if (leadId) {
        await prisma.note.create({
          data: { entity_type: "Lead", entity_id: leadId, content: data.notes, created_by_id: userId },
        });
        createLeadReviewEvent({
          lead_id: leadId, triggered_by_id: userId, trigger_type: "NoteAdded",
          trigger_context: { note_preview: data.notes.slice(0, 120) },
        });
      }
      return NextResponse.json({ data: updated, action: "notes_updated" });
    }

    // ── update_stage ──────────────────────────────────────────────────────────
    if (data.action === "update_stage") {
      if (!fu.lead) return NextResponse.json({ error: "No linked lead" }, { status: 400 });
      const fromStage = fu.lead.status;
      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId! }, data: { status: data.to_stage, updated_at: now } }),
        prisma.leadStageHistory.create({
          data: { lead_id: leadId!, from_stage: fromStage, to_stage: data.to_stage, changed_by_id: userId, notes: data.notes },
        }),
        prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId!,
            action: "stage_changed", actor_id: userId,
            metadata: { pipeline_from: fromStage, pipeline_to: data.to_stage, notes: data.notes },
          },
        }),
      ]);
      const fuUpdate = await prisma.followUp.update({
        where: { id }, data: { outcome: `Stage: ${data.to_stage}`, notes: data.notes },
      });
      notifyLeadStageChanged({
        assignedToId: fu.lead.assigned_to_id, leadId: leadId!, leadName: fu.lead.full_name,
        leadNumber: fu.lead.lead_number, fromStage, toStage: data.to_stage,
        changedByName: session.user.name ?? session.user.email ?? "Agent", notes: data.notes,
      });
      createLeadReviewEvent({
        lead_id: leadId!, triggered_by_id: userId, trigger_type: "StageChange",
        trigger_context: { from_status: fromStage, to_stage: data.to_stage, notes: data.notes },
      });
      return NextResponse.json({ data: fuUpdate, action: "stage_updated" });
    }

    // ── mark_lost ─────────────────────────────────────────────────────────────
    if (data.action === "mark_lost") {
      if (!fu.lead) return NextResponse.json({ error: "No linked lead" }, { status: 400 });
      const fromStage = fu.lead.status;
      await prisma.$transaction([
        prisma.lead.update({
          where: { id: leadId! },
          data: { status: "Lost", lost_reason: data.lost_reason as never, lost_notes: data.lost_notes ?? data.notes, updated_at: now },
        }),
        prisma.leadStageHistory.create({
          data: { lead_id: leadId!, from_stage: fromStage, to_stage: "Lost", changed_by_id: userId, notes: data.notes },
        }),
        prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId!, action: "stage_changed", actor_id: userId,
            metadata: { pipeline_from: fromStage, pipeline_to: "Lost", lost_reason: data.lost_reason, notes: data.notes },
          },
        }),
      ]);
      const fuUpdate = await prisma.followUp.update({
        where: { id }, data: { completed_at: now, outcome: "Lost", notes: data.notes },
      });
      notifyLeadLost({
        assignedToId: fu.lead.assigned_to_id, leadId: leadId!, leadName: fu.lead.full_name,
        leadNumber: fu.lead.lead_number, lostReason: data.lost_reason as never,
        markedByName: session.user.name ?? session.user.email ?? "Agent",
      });
      createLeadReviewEvent({
        lead_id: leadId!, triggered_by_id: userId, trigger_type: "StageChange",
        trigger_context: { from_status: fromStage, to_stage: "Lost", lost_reason: data.lost_reason },
      });
      return NextResponse.json({ data: fuUpdate, action: "completed" });
    }

    // ── mark_won ──────────────────────────────────────────────────────────────
    if (data.action === "mark_won") {
      if (!fu.lead) return NextResponse.json({ error: "No linked lead" }, { status: 400 });
      const fromStage = fu.lead.status;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadWonData: Record<string, any> = { status: "Won", updated_at: now };
      if (data.settlement_value !== undefined) leadWonData.settlement_value = data.settlement_value;
      if (data.deal_commission_percent !== undefined) leadWonData.deal_commission_percent = data.deal_commission_percent;

      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId! }, data: leadWonData }),
        prisma.leadStageHistory.create({
          data: { lead_id: leadId!, from_stage: fromStage, to_stage: "Won", changed_by_id: userId, notes: data.notes },
        }),
        prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId!, action: "stage_changed", actor_id: userId,
            metadata: { pipeline_from: fromStage, pipeline_to: "Won", settlement_value: data.settlement_value ?? null, notes: data.notes },
          },
        }),
      ]);

      // Notify admins
      const admins = await prisma.user.findMany({ where: { role: "Admin", is_active: true }, select: { id: true } });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({
            user_id: a.id, type: "StageChanged" as const,
            message: `Deal Won: ${fu.lead!.full_name} (${fu.lead!.lead_number})${data.settlement_value ? ` — ₹${Number(data.settlement_value).toLocaleString("en-IN")}` : ""}`,
            entity_type: "Lead" as const, entity_id: leadId!,
          })),
          skipDuplicates: true,
        });
      }
      notifyLeadWon({
        assignedToId: fu.lead.assigned_to_id, leadId: leadId!, leadName: fu.lead.full_name,
        leadNumber: fu.lead.lead_number,
        settlementValue: data.settlement_value ?? 0, commissionPercent: data.deal_commission_percent ?? 0,
        closedByName: session.user.name ?? session.user.email ?? "Agent",
      });

      const fuUpdate = await prisma.followUp.update({
        where: { id }, data: { completed_at: now, outcome: "Won", notes: data.notes },
      });
      createLeadReviewEvent({
        lead_id: leadId!, triggered_by_id: userId, trigger_type: "StageChange",
        trigger_context: { from_status: fromStage, to_stage: "Won", settlement_value: data.settlement_value ?? null },
      });
      return NextResponse.json({ data: fuUpdate, action: "completed" });
    }

    // ── site_visit_done ───────────────────────────────────────────────────────
    if (data.action === "site_visit_done") {
      if (!fu.lead) return NextResponse.json({ error: "No linked lead" }, { status: 400 });
      const fromStage = fu.lead.status;
      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId! }, data: { status: "SiteVisitCompleted", updated_at: now } }),
        prisma.leadStageHistory.create({
          data: { lead_id: leadId!, from_stage: fromStage, to_stage: "SiteVisitCompleted", changed_by_id: userId, notes: data.notes },
        }),
        prisma.activity.create({
          data: {
            entity_type: "Lead", entity_id: leadId!, action: "stage_changed", actor_id: userId,
            metadata: { pipeline_from: fromStage, pipeline_to: "SiteVisitCompleted", notes: data.notes },
          },
        }),
      ]);

      const fuUpdate = await prisma.followUp.update({
        where: { id }, data: { completed_at: now, outcome: "Site Visit Done", notes: data.notes },
      });

      if (leadId && data.next_followup_date && data.next_followup_type) {
        const nextDate = new Date(data.next_followup_date);
        await prisma.followUp.create({
          data: {
            lead_id: leadId, type: data.next_followup_type, priority: "High",
            scheduled_at: nextDate, created_by_id: userId, assigned_to_id: fu.assigned_to_id,
          },
        });
        await prisma.lead.update({
          where: { id: leadId },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { next_followup_date: nextDate, followup_type: data.next_followup_type as any },
        });
      }

      createLeadReviewEvent({
        lead_id: leadId!, triggered_by_id: userId, trigger_type: "StageChange",
        trigger_context: { from_status: fromStage, to_stage: "SiteVisitCompleted" },
      });
      return NextResponse.json({ data: fuUpdate, action: "completed" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/follow-ups/[id]/action:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
