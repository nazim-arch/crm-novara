# CRM Technical Architecture Note

## Purpose

This note documents the CRM implementation from an engineering perspective, with emphasis on:

- module boundaries
- data model structure
- page/component/API ownership
- cross-module linkages
- role scoping
- side effects such as notifications, activity logs, revenue updates, and commission recalculation

## 1. Primary Architecture Shape

The CRM is a Next.js App Router application with:

- server-rendered route pages under `app/(dashboard)/...`
- API route handlers under `app/api/...`
- Prisma for persistence
- feature-specific client components under `components/...`
- role and scope enforcement in `lib/rbac.ts`

Primary business entities are defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma):

- `Lead`
- `Opportunity`
- `LeadOpportunity`
- `Task`
- `FollowUp`
- `LeadStageHistory`
- `Activity`
- `Note`
- `Notification`

## 2. Data Model References

### Lead

Defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma).

Important fields:

- `lead_number`
- `temperature`
- `status`
- `activity_stage`
- `lead_type`
- `next_followup_date`
- `followup_type`
- `potential_lead_value`
- `settlement_value`
- `deal_commission_percent`
- `lead_owner_id`
- `assigned_to_id`
- `created_by_id`
- `deleted_at`

Relationships:

- `opportunities: LeadOpportunity[]`
- `tasks: Task[]`
- `stage_history: LeadStageHistory[]`
- `followups: FollowUp[]`

### Opportunity

Defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma).

Important fields:

- `opp_number`
- `opportunity_by`
- `property_type`
- `commission_percent`
- `total_sales_value`
- `possible_revenue`
- `closed_revenue`
- `deleted_at`

Relationships:

- `configurations: OpportunityConfiguration[]`
- `leads: LeadOpportunity[]`
- `tasks: Task[]`
- `expenses: OpportunityExpense[]`
- `follow_ups: FollowUp[]`

### LeadOpportunity

Defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma).

Purpose:

- junction table between leads and opportunities
- stores tagging metadata such as `tagged_at`, `tagged_by_id`, `smart_match_score`, `notes`

Current implementation note:

- database allows many-to-many
- lead UI currently enforces a single-active-link workflow by deleting existing mappings before creating a new one

### Task

Defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma).

Important fields:

- `task_number`
- `priority`
- `status`
- `due_date`
- `start_date`
- `completion_date`
- `sector`
- `revenue_tagged`
- `revenue_amount`
- `recurrence`
- `lead_id`
- `opportunity_id`
- `client_id`
- `deleted_at`

### FollowUp

Defined in [schema.prisma](C:\Users\Nzmma\CRM_Novara\crm-novara\prisma\schema.prisma).

Important fields:

- `lead_id`
- `opportunity_id`
- `task_id`
- `assigned_to_id`
- `type`
- `priority`
- `scheduled_at`
- `completed_at`
- `notes`
- `outcome`

## 3. Leads Module

### Route Pages

- Leads list: [app/(dashboard)/leads/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\leads\page.tsx)
- Lead detail: [app/(dashboard)/leads/[id]/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\leads\[id]\page.tsx)
- Lead new: [app/(dashboard)/leads/new/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\leads\new\page.tsx)
- Lead edit: [app/(dashboard)/leads/[id]/edit/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\leads\[id]\edit\page.tsx)

### Main Components

- Lead form: [components/leads/LeadForm.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\LeadForm.tsx)
- Lead filters: [components/leads/LeadFilters.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\LeadFilters.tsx)
- Stage changer: [components/leads/StageChanger.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\StageChanger.tsx)
- Note form: [components/leads/NoteForm.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\NoteForm.tsx)
- Lead import modal: [components/leads/LeadImportModal.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\LeadImportModal.tsx)
- Lead bulk update modal: [components/leads/LeadUpdateModal.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\leads\LeadUpdateModal.tsx)
- Contact actions: [components/shared/LeadContactActions.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\shared\LeadContactActions.tsx)

### Lead APIs

- list/create: [app/api/leads/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\route.ts)
- get/update/delete: [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts)
- stage/activity stage change: [app/api/leads/[id]/stage/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\stage\route.ts)
- lead-opportunity tagging: [app/api/leads/[id]/opportunities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\opportunities\route.ts)
- click-to-contact activity logging: [app/api/leads/[id]/contact/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\contact\route.ts)
- duplicate check: [app/api/leads/check-duplicate/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\check-duplicate\route.ts)
- import: [app/api/leads/import/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\import\route.ts)
- bulk update: [app/api/leads/bulk-update/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\bulk-update\route.ts)
- export: [app/api/leads/export/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\export\route.ts)
- notes: [app/api/leads/[id]/notes/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\notes\route.ts)
- activity timeline feed: [app/api/leads/[id]/activities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\activities\route.ts)

### Key behaviors

#### Create flow

Implemented in [app/api/leads/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\route.ts):

- validates via `createLeadSchema`
- generates lead number via `generateId("LEAD")`
- writes `lead_created` activity
- inserts initial `LeadStageHistory`
- creates notifications
- triggers email notifications

#### Update flow

Implemented in [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts):

- validates via `updateLeadSchema`
- normalizes empty strings to `null`
- logs `lead_updated` activity
- detects reassignment and triggers email

#### Stage flow

Implemented in [app/api/leads/[id]/stage/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\stage\route.ts):

- supports pipeline stage and activity-stage changes
- auto-resolves `NotInterested -> Lost`
- auto-resolves `Junk -> InvalidLead`
- logs activity and `LeadStageHistory`
- recalculates linked opportunity `closed_revenue`
- emits won/lost/stage-change notifications

#### Delete flow

Implemented in [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts):

- soft-deletes lead
- soft-deletes linked tasks
- hard-deletes linked follow-ups
- recalculates linked opportunities’ `closed_revenue`
- recalculates commission records for won leads where monthly records are still `Live`

## 4. Opportunities Module

### Route Pages

- Opportunities list: [app/(dashboard)/opportunities/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\opportunities\page.tsx)
- Opportunity detail: [app/(dashboard)/opportunities/[id]/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\opportunities\[id]\page.tsx)
- Opportunity new: [app/(dashboard)/opportunities/new/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\opportunities\new\page.tsx)
- Opportunity edit: [app/(dashboard)/opportunities/[id]/edit/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\opportunities\[id]\edit\page.tsx)

### Main Components

- Opportunity form: [components/opportunities/OpportunityForm.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\opportunities\OpportunityForm.tsx)
- Expenses section: [components/opportunities/ExpensesSection.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\opportunities\ExpensesSection.tsx)

### Opportunity APIs

- list/create: [app/api/opportunities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\route.ts)
- get/update/delete/tag lead: [app/api/opportunities/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\route.ts)
- expenses list/create: [app/api/opportunities/[id]/expenses/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\expenses\route.ts)
- expense delete/update: [app/api/opportunities/[id]/expenses/[expenseId]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\expenses\[expenseId]\route.ts)
- export: [app/api/opportunities/export/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\export\route.ts)

### Key behaviors

#### Create/update flow

Implemented in:

- [app/api/opportunities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\route.ts)
- [app/api/opportunities/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\route.ts)

Behavior:

- validates via `createOpportunitySchema` / `updateOpportunitySchema`
- computes row totals from configurations
- computes `total_sales_value`
- computes `possible_revenue`
- stores configurations as child rows

#### Lead tagging

Opportunity-side tagging is implemented in [app/api/opportunities/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\route.ts):

- upserts into `LeadOpportunity`
- logs `opportunity_tagged` on the lead activity timeline
- triggers lead-tagged-to-opportunity email notification

#### Delete flow

Implemented in [app/api/opportunities/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\route.ts):

- soft-deletes opportunity
- soft-deletes linked tasks
- hard-deletes follow-ups
- hard-deletes expenses

## 5. Tasks Module

### Route Pages

- Tasks list: [app/(dashboard)/tasks/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\tasks\page.tsx)
- Task detail: [app/(dashboard)/tasks/[id]/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\tasks\[id]\page.tsx)
- Task new: [app/(dashboard)/tasks/new/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\tasks\new\page.tsx)
- Task edit: [app/(dashboard)/tasks/[id]/edit/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\tasks\[id]\edit\page.tsx)

### Main Components

- Task form: [components/tasks/TaskForm.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\tasks\TaskForm.tsx)
- Task table: [components/tasks/TaskTable.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\tasks\TaskTable.tsx)
- Kanban board: [components/tasks/KanbanBoard.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\tasks\KanbanBoard.tsx)
- Task status changer: [components/tasks/TaskStatusChanger.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\tasks\TaskStatusChanger.tsx)

### Task APIs

- list/create: [app/api/tasks/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\route.ts)
- get/update/delete: [app/api/tasks/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\route.ts)
- notes: [app/api/tasks/[id]/notes/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\notes\route.ts)
- activity feed: [app/api/tasks/[id]/activities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\activities\route.ts)
- export: [app/api/tasks/export/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\export\route.ts)

### Key behaviors

#### Create flow

Implemented in [app/api/tasks/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\route.ts):

- validates through `createTaskSchema`
- generates task number
- writes `task_created` activity
- creates assignment notification
- triggers task assignment email

#### Update flow

Implemented in [app/api/tasks/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\route.ts):

- validates through `updateTaskSchema`
- if status becomes `Done`, sets `completion_date`
- logs `task_updated` activity
- triggers reassignment email when applicable

#### Delete flow

Implemented in [app/api/tasks/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\route.ts):

- soft-delete only

## 6. Follow-ups Module

### Route Pages

- Global follow-ups page: [app/(dashboard)/follow-ups/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\follow-ups\page.tsx)

Embedded follow-up surfaces:

- lead detail: [app/(dashboard)/leads/[id]/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\leads\[id]\page.tsx)
- opportunity detail: [app/(dashboard)/opportunities/[id]/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\opportunities\[id]\page.tsx)

### Main Components

- Global follow-up client: [components/follow-ups/FollowUpsClient.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\follow-ups\FollowUpsClient.tsx)
- Embedded follow-up section: [components/follow-ups/FollowUpSection.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\follow-ups\FollowUpSection.tsx)

### Follow-up APIs

- list/create: [app/api/follow-ups/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\route.ts)
- update/delete: [app/api/follow-ups/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\[id]\route.ts)
- export: [app/api/follow-ups/export/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\export\route.ts)

### Key behaviors

#### Create flow

Implemented in [app/api/follow-ups/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\route.ts):

- supports `lead_id`, `opportunity_id`, or `task_id`
- if linked to a lead, syncs `lead.next_followup_date` and `lead.followup_type`
- only updates lead follow-up state when the new follow-up is the earliest pending one

#### Complete flow

Implemented in [app/api/follow-ups/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\[id]\route.ts):

- marks completion
- if lead-linked, finds next pending follow-up and re-syncs lead state

#### Delete flow

Implemented in [app/api/follow-ups/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\[id]\route.ts):

- restricted to Admin/Manager
- if deleting a pending lead-linked follow-up, recalculates lead’s next follow-up

## 7. Dashboards

### Sales Dashboard

Route:

- [app/(dashboard)/dashboard/sales/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\dashboard\sales\page.tsx)

Client:

- [components/dashboard/SalesDashboardClient.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\dashboard\SalesDashboardClient.tsx)

Key architecture points:

- custom period resolution logic lives in page layer
- page executes the Prisma aggregation workload
- client component handles charts, period switching, action queue rendering, and drill-down links
- action queue uses `LeadContactActions`
- “actioned” excludes the initial synthetic `LeadStageHistory` row by requiring `from_stage != null`

### CRM Overview Dashboard

Route:

- [app/(dashboard)/dashboard/crm/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\dashboard\crm\page.tsx)

Client:

- [components/dashboard/CrmDashboardClient.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\dashboard\CrmDashboardClient.tsx)

Key architecture points:

- aggregates leads, opportunities, tasks, activity, and client workload in one server page
- uses `resolveDateRange` from [lib/date-range.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\lib\date-range.ts)
- financial widgets are gated by permission

### Task Dashboard

Route:

- [app/(dashboard)/dashboard/tasks/page.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\app\(dashboard)\dashboard\tasks\page.tsx)

Supporting components:

- [components/dashboard/TaskStatsCards.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\dashboard\TaskStatsCards.tsx)
- [components/dashboard/AssigneeBarChart.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\dashboard\AssigneeBarChart.tsx)
- [components/dashboard/ClientBarChart.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\dashboard\ClientBarChart.tsx)

Key architecture points:

- scoped for Sales/Operations at query level
- mixes all-time active counts with range-scoped counts
- computes revenue-at-risk from overdue revenue-tagged tasks

## 8. Shared Infrastructure

### RBAC

Defined in [lib/rbac.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\lib\rbac.ts).

Contains:

- permission matrix
- `hasPermission`
- `leadScopeFilter`
- `taskScopeFilter`
- `defaultLandingPath`

### Sidebar Navigation

Defined in [components/shared/Sidebar.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\shared\Sidebar.tsx).

Role-aware menu structure includes:

- Sales Dashboard
- CRM Overview
- Task Overview
- Leads
- Opportunities
- Follow-ups
- Tasks
- Commission
- Reports
- Settings

### Quick Add

Defined in [components/shared/QuickAddModal.tsx](C:\Users\Nzmma\CRM_Novara\crm-novara\components\shared\QuickAddModal.tsx).

Role-aware surfaces:

- Admin: lead, opportunity, task, follow-up, expense
- Sales: lead, task, follow-up, expense
- Operations: task only

Quick Add integrates directly with:

- `/api/leads`
- `/api/opportunities`
- `/api/tasks`
- `/api/follow-ups`
- `/api/opportunities/[id]/expenses`

## 9. Cross-Module Side Effects

### Lead -> Opportunity revenue

Triggered in:

- [app/api/leads/[id]/stage/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\stage\route.ts)
- [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts)

Effect:

- `closed_revenue` is recalculated from all non-deleted won leads linked to each opportunity

### FollowUp -> Lead

Triggered in:

- [app/api/follow-ups/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\route.ts)
- [app/api/follow-ups/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\follow-ups\[id]\route.ts)

Effect:

- maintains lead-level next follow-up state

### Lead delete -> Commission record

Triggered in:

- [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts)

Effect:

- if deleted lead was won, recomputes monthly commission record when record status is `Live`

### Click-to-contact -> Activity

Triggered in:

- [app/api/leads/[id]/contact/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\contact\route.ts)

Effect:

- logs `call_attempted`, `whatsapp_opened`, or `whatsapp_message_sent`
- updates `last_contact_date`

## 10. Notification / Email Integration

Email helpers are invoked from:

- [app/api/leads/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\route.ts)
- [app/api/leads/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\route.ts)
- [app/api/leads/[id]/stage/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\leads\[id]\stage\route.ts)
- [app/api/opportunities/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\route.ts)
- [app/api/opportunities/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\opportunities\[id]\route.ts)
- [app/api/tasks/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\route.ts)
- [app/api/tasks/[id]/route.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\app\api\tasks\[id]\route.ts)

Shared helper files:

- [lib/email-notifications.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\lib\email-notifications.ts)
- [lib/email.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\lib\email.ts)
- [lib/email-templates.ts](C:\Users\Nzmma\CRM_Novara\crm-novara\lib\email-templates.ts)

## 11. Architecture Summary

The current CRM implementation is centered on server-side query orchestration and API-driven mutation side effects.

The most important architectural characteristics are:

- lead state is the backbone of the sales system
- follow-ups actively maintain lead action readiness
- opportunities combine inventory and revenue logic
- tasks bridge CRM work and operational/client work
- dashboards are query-heavy server pages that feed interactive client renderers
- mutation handlers contain real business side effects, not just persistence

The highest-value engineering linkages currently implemented are:

- lead stage changes -> opportunity revenue recalculation
- follow-up changes -> lead next-follow-up synchronization
- lead deletion -> commission and opportunity recalculation
- dashboard cards -> filtered operational queues
