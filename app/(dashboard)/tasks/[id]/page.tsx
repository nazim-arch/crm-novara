import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/LeadStatusBadge";
import { ActivityTimeline } from "@/components/shared/ActivityTimeline";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac";
import { TaskStatusChanger } from "@/components/tasks/TaskStatusChanger";
import { NoteForm } from "@/components/leads/NoteForm";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import {
  ArrowLeft,
  Edit,
  Calendar,
  User,
  Link2,
  IndianRupee,
  RefreshCw,
  AlarmClock,
  Briefcase,
} from "lucide-react";

type Params = Promise<{ id: string }>;

export default async function TaskDetailPage({ params }: { params: Params }) {
  const session = await auth();
  const { id } = await params;

  const [task, taskNotes] = await Promise.all([
    prisma.task.findUnique({
      where: { id, deleted_at: null },
      include: {
        assigned_to: { select: { id: true, name: true, email: true } },
        created_by: { select: { id: true, name: true } },
        lead: { select: { id: true, lead_number: true, full_name: true, status: true } },
        opportunity: { select: { id: true, opp_number: true, name: true, status: true } },
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.note.findMany({
      where: { entity_type: "Task", entity_id: id },
      include: { created_by: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
  ]);

  if (!task) notFound();

  const canEdit = session?.user && hasPermission(session.user.role, "task:update");
  const canDelete = session?.user && hasPermission(session.user.role, "task:delete");

  const isOverdue =
    new Date(task.due_date) < new Date() &&
    !["Done", "Cancelled"].includes(task.status);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/tasks" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">{task.title}</h1>
              <TaskStatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">{task.task_number}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canEdit && (
            <Button variant="outline" size="sm" render={<Link href={`/tasks/${id}/edit`} />}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
          {canDelete && (
            <DeleteConfirmButton
              label="Delete"
              confirmText={`Delete "${task.title}"? This cannot be undone.`}
              apiPath={`/api/tasks/${id}`}
              redirectTo="/tasks"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status changer */}
          {canEdit && (
            <Card>
              <CardContent className="pt-4">
                <TaskStatusChanger taskId={task.id} currentStatus={task.status} />
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {task.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{task.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEdit && (
                <NoteForm apiPath={`/api/tasks/${task.id}/notes`} />
              )}
              {taskNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {taskNotes.map((note) => (
                    <div key={note.id} className="border rounded-lg p-3">
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

          {/* Notes from task.notes field */}
          {task.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Task Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{task.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Activity timeline */}
          <ActivityTimeline entityType="Task" entityId={task.id} apiPath={`/api/tasks/${task.id}/activities`} />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Dates */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className={isOverdue ? "text-destructive font-medium" : ""}>
                    {formatDate(task.due_date)}
                    {isOverdue && " (Overdue)"}
                  </p>
                </div>
              </div>
              {task.start_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p>{formatDate(task.start_date)}</p>
                  </div>
                </div>
              )}
              {task.completion_date && (
                <div className="flex items-center gap-2">
                  <AlarmClock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p>{formatDateTime(task.completion_date)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assignment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Assigned To</p>
                  <p>{task.assigned_to.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Created By</p>
                  <p>{task.created_by.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{formatDateTime(task.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {task.client && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p>{task.client.name}</p>
                  </div>
                </div>
              )}
              {task.sector && (
                <div>
                  <p className="text-xs text-muted-foreground">Sector</p>
                  <p>{task.sector}</p>
                </div>
              )}
              {task.recurrence !== "None" && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Recurrence</p>
                    <p>{task.recurrence}</p>
                  </div>
                </div>
              )}
              {task.revenue_tagged && (
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue Tagged</p>
                    <p>
                      {task.revenue_amount
                        ? formatCurrency(Number(task.revenue_amount))
                        : "Yes (no amount)"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked records */}
          {(task.lead || task.opportunity) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Linked To</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {task.lead && (
                  <div className="flex items-start gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Lead</p>
                      <Link
                        href={`/leads/${task.lead.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {task.lead.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{task.lead.lead_number}</p>
                    </div>
                  </div>
                )}
                {task.opportunity && (
                  <div className="flex items-start gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Opportunity</p>
                      <Link
                        href={`/opportunities/${task.opportunity.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {task.opportunity.name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{task.opportunity.opp_number}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
