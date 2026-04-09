import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LeadStatusBadge, TemperatureBadge, TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils";
import { StageChanger } from "@/components/leads/StageChanger";
import { NoteForm } from "@/components/leads/NoteForm";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Calendar, IndianRupee } from "lucide-react";
import { hasPermission } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

export default async function LeadDetailPage({ params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  const [lead, notes] = await Promise.all([
    prisma.lead.findUnique({
      where: { id, deleted_at: null },
      include: {
        assigned_to: { select: { id: true, name: true, email: true } },
        lead_owner: { select: { id: true, name: true } },
        created_by: { select: { id: true, name: true } },
        opportunities: {
          include: { opportunity: true },
          orderBy: { tagged_at: "desc" },
        },
        tasks: {
          where: { deleted_at: null },
          include: { assigned_to: { select: { id: true, name: true } } },
          orderBy: { due_date: "asc" },
          take: 5,
        },
        stage_history: {
          include: { changed_by: { select: { id: true, name: true } } },
          orderBy: { changed_at: "desc" },
          take: 5,
        },
      },
    }),
    prisma.note.findMany({
      where: { entity_type: "Lead", entity_id: id },
      include: { created_by: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 10,
    }),
  ]);

  if (!lead) notFound();

  const canEdit = session?.user && hasPermission(session.user.role, "lead:update");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/leads" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">{lead.full_name}</h1>
              <LeadStatusBadge status={lead.status} />
              <TemperatureBadge temperature={lead.temperature} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">{lead.lead_number}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && (
            <Button variant="outline" size="sm" render={<Link href={`/leads/${id}/edit`} />}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
          {canEdit && (
            <Button size="sm" render={<Link href={`/tasks/new?lead_id=${id}`} />}>
              + Task
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stage pipeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pipeline Stage</CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <StageChanger leadId={lead.id} currentStage={lead.status} />
              ) : (
                <LeadStatusBadge status={lead.status} />
              )}
            </CardContent>
          </Card>

          {/* Contact & Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Lead Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{lead.phone}</span>
                </div>
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.location_preference && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{lead.location_preference}</span>
                  </div>
                )}
                {lead.next_followup_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span
                      className={
                        new Date(lead.next_followup_date) < new Date()
                          ? "text-destructive font-medium"
                          : ""
                      }
                    >
                      Follow-up: {formatDate(lead.next_followup_date)}
                      {lead.followup_type && ` (${lead.followup_type})`}
                    </span>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <InfoItem label="Lead Source" value={lead.lead_source} />
                <InfoItem label="Property Type" value={lead.property_type} />
                <InfoItem label="Unit Type" value={lead.unit_type} />
                <InfoItem label="Purpose" value={lead.purpose === "EndUse" ? "End Use" : lead.purpose} />
                <InfoItem label="Timeline" value={lead.timeline_to_buy} />
                {lead.budget_min || lead.budget_max ? (
                  <InfoItem
                    label="Budget"
                    value={`${lead.budget_min ? formatCurrency(Number(lead.budget_min)) : "?"} – ${lead.budget_max ? formatCurrency(Number(lead.budget_max)) : "?"}`}
                  />
                ) : null}
                {lead.deal_value && (
                  <InfoItem label="Deal Value" value={formatCurrency(Number(lead.deal_value))} />
                )}
                {lead.commission_estimate && (
                  <InfoItem label="Commission Est." value={formatCurrency(Number(lead.commission_estimate))} />
                )}
                {lead.closing_probability !== null && (
                  <InfoItem label="Closing %" value={`${lead.closing_probability}%`} />
                )}
              </div>

              {lead.lost_reason && (
                <>
                  <Separator className="my-4" />
                  <div className="bg-destructive/10 rounded-lg p-3 text-sm">
                    <p className="font-medium text-destructive">Lost: {lead.lost_reason}</p>
                    {lead.lost_notes && <p className="text-muted-foreground mt-1">{lead.lost_notes}</p>}
                    {lead.alternate_requirement && (
                      <p className="text-muted-foreground mt-1">
                        Alternate: {lead.alternate_requirement}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEdit && <NoteForm leadId={lead.id} />}
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-muted/30 rounded-lg p-3">
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {note.created_by.name} · {formatDateTime(note.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                entityType="Lead"
                entityId={lead.id}
                apiPath={`/api/leads/${lead.id}/activities`}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Ownership */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Ownership</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoItem label="Lead Owner" value={lead.lead_owner.name} />
              <InfoItem label="Assigned To" value={lead.assigned_to.name} />
              <InfoItem label="Created By" value={lead.created_by.name} />
              <InfoItem label="Created" value={formatDate(lead.created_at)} />
              <InfoItem label="Updated" value={formatDate(lead.updated_at)} />
            </CardContent>
          </Card>

          {/* Linked Opportunities */}
          {lead.opportunities.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Opportunities ({lead.opportunities.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lead.opportunities.map(({ opportunity }) => (
                  <Link
                    key={opportunity.id}
                    href={`/opportunities/${opportunity.id}`}
                    className="block p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <p className="font-medium text-sm">{opportunity.name}</p>
                    <p className="text-xs text-muted-foreground">{opportunity.location}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tasks */}
          {lead.tasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Tasks ({lead.tasks.length})</CardTitle>
                  <Button variant="ghost" size="sm" render={<Link href={`/tasks/new?lead_id=${id}`} />}>
                    + Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {lead.tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="block p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      <TaskStatusBadge status={task.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <PriorityBadge priority={task.priority} />
                      <span className="text-xs text-muted-foreground">
                        Due {formatDate(task.due_date)}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Stage History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Stage History</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.stage_history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stage changes</p>
              ) : (
                <div className="space-y-2">
                  {lead.stage_history.map((h) => (
                    <div key={h.id} className="text-sm">
                      <div className="flex items-center gap-1 flex-wrap">
                        {h.from_stage && <LeadStatusBadge status={h.from_stage} />}
                        {h.from_stage && <span className="text-muted-foreground text-xs">→</span>}
                        <LeadStatusBadge status={h.to_stage} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.changed_by.name} · {formatDate(h.changed_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
