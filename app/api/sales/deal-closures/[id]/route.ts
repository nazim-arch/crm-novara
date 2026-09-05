import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermissionAsync } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  reconcileDealClosure,
  DealClosureError,
  type DealClosureErrorCode,
} from "@/lib/deal-closures";
import { getActiveSlabs } from "@/lib/sales-commission";

type Params = Promise<{ id: string }>;

const CLOSURE_INCLUDE = {
  lead: { select: { id: true, full_name: true, lead_number: true } },
  planned_by: { select: { id: true, name: true } },
  reconciled_by: { select: { id: true, name: true } },
  agent_shares: {
    orderBy: { created_at: "asc" as const },
    select: {
      id: true,
      agent_id: true,
      role: true,
      planned_commission_amount: true,
      actual_commission_amount: true,
      incentive_amount: true,
      commission_variance: true,
      agent: { select: { id: true, name: true } },
    },
  },
} as const;

// GET /api/sales/deal-closures/:id — full detail for the reconciliation drawer
export async function GET(_request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "commission:reconcile")))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const closure = await prisma.dealClosure.findUnique({
      where: { id },
      include: CLOSURE_INCLUDE,
    });
    if (!closure) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Read-only slab hint data: the active slab brackets for each agent on this deal,
    // for the deal's Won month. Informational only — never auto-fills a manual figure.
    const agentIds = [...new Set(closure.agent_shares.map((s) => s.agent_id))];
    const slabEntries = await Promise.all(
      agentIds.map(async (agentId) => {
        const slabs = await getActiveSlabs(agentId, closure.won_year, closure.won_month);
        return [
          agentId,
          slabs.map((s) => ({
            from_amount: Number(s.from_amount),
            to_amount: s.to_amount != null ? Number(s.to_amount) : null,
            commission_pct: Number(s.commission_pct),
          })),
        ] as const;
      }),
    );
    const agent_slabs = Object.fromEntries(slabEntries);

    return NextResponse.json({ data: closure, agent_slabs });
  } catch (error) {
    console.error("GET /api/sales/deal-closures/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  actual_settlement_value: z.number().nonnegative().nullable(),
  shares: z
    .array(
      z.object({
        agent_id: z.string().min(1),
        role: z.string().trim().max(60).nullish(),
        actual_commission_amount: z.number().nonnegative().nullable(),
        incentive_amount: z.number().nonnegative().default(0),
      }),
    )
    .min(1, "At least one agent share is required."),
  notes: z.string().trim().max(2000).nullish(),
  status: z.enum(["Pending", "Reconciled"]),
});

const ERROR_STATUS: Record<DealClosureErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  MAKER_CHECKER: 403,
  NOTES_REQUIRED: 422,
  VALIDATION: 422,
};

// PATCH /api/sales/deal-closures/:id — save draft (Pending) or reconcile (Reconciled)
export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await hasPermissionAsync(session.user.role, "commission:reconcile")))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    // Reject duplicate agents in the payload up front (the DB unique would 500 otherwise).
    const agentIds = parsed.data.shares.map((s) => s.agent_id);
    if (new Set(agentIds).size !== agentIds.length)
      return NextResponse.json({ error: "An agent can only appear once per deal." }, { status: 422 });

    const updated = await reconcileDealClosure({
      deal_closure_id: id,
      actual_settlement_value: parsed.data.actual_settlement_value,
      shares: parsed.data.shares.map((s) => ({
        agent_id: s.agent_id,
        role: s.role ?? null,
        actual_commission_amount: s.actual_commission_amount,
        incentive_amount: s.incentive_amount,
      })),
      reconciled_by_id: session.user.id,
      notes: parsed.data.notes ?? null,
      markReconciled: parsed.data.status === "Reconciled",
    });

    const full = await prisma.dealClosure.findUnique({
      where: { id: updated.id },
      include: CLOSURE_INCLUDE,
    });
    return NextResponse.json({ data: full });
  } catch (error) {
    if (error instanceof DealClosureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: ERROR_STATUS[error.code] });
    }
    console.error("PATCH /api/sales/deal-closures/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
