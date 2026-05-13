# CRM Build Documentation

## Scope

This document summarizes what has been built across the CRM areas most closely tied to:

- Leads
- Opportunities
- Follow-ups
- Tasks
- Dashboards
- The linkages and operational flow between those modules

The summary is based on the current application code, Prisma schema, API handlers, dashboards, and recent implementation history in the repository.

## 1. System Overview

The CRM is structured around `Lead`, `Opportunity`, `Task`, and `FollowUp` as primary operating records, with shared support from:

- `LeadStageHistory` for pipeline progression
- `Activity` for timeline logging
- `Note` for record-level notes
- `Notification` for in-app alerts
- Email notification helpers for assignment and stage-change events
- Role-based access control through `lib/rbac.ts`

At a high level:

- Leads are the core sales pipeline records.
- Opportunities represent inventory / projects / dealable supply.
- A lead can be linked to an opportunity through the `LeadOpportunity` junction.
- Tasks are operational work items that can optionally link to a lead, opportunity, and client.
- Follow-ups are scheduling and action records that can link to a lead, opportunity, or task.
- Dashboards aggregate pipeline health, follow-up load, task load, revenue, and opportunity performance.

## 2. Core Data Model

### Leads

Leads include:

- identity and contact fields
- ownership and assignment
- temperature (`Hot`, `Warm`, `Cold`, `FollowUpLater`)
- pipeline status (`New`, `Prospect`, `SiteVisitCompleted`, `Negotiation`, `Won`, `Lost`, `InvalidLead`, `OnHold`, `Recycle`)
- activity stage (`New`, `NoResponse`, `Busy`, `Unreachable`, `Prospect`, `CallBack`, `NotInterested`, `Junk`)
- requirement and qualification fields
- financial potential fields
- next follow-up tracking
- won / lost fields
- soft-delete support

Relationships:

- `Lead -> Task[]`
- `Lead -> FollowUp[]`
- `Lead -> LeadStageHistory[]`
- `Lead -> LeadOpportunity[]`

### Opportunities

Opportunities include:

- project / opportunity identity
- category via `opportunity_by` (`Developer`, `Seller`, `Buyer`)
- property type, location, commission %
- status (`Active`, `Inactive`, `Sold`)
- financial rollups:
  - `total_sales_value`
  - `possible_revenue`
  - `closed_revenue`

Relationships:

- `Opportunity -> OpportunityConfiguration[]`
- `Opportunity -> LeadOpportunity[]`
- `Opportunity -> Task[]`
- `Opportunity -> OpportunityExpense[]`
- `Opportunity -> FollowUp[]`

### Tasks

Tasks include:

- title, description, due/start/completion dates
- status (`Todo`, `InProgress`, `Done`, `Cancelled`)
- priority
- recurrence
- optional sector
- optional revenue tagging
- optional linkage to lead, opportunity, and client
- soft-delete support

### Follow-ups

Follow-ups support:

- lead-linked follow-ups
- opportunity-linked follow-ups
- task-linked follow-ups
- assignment
- scheduled date/time
- completion tracking
- priority and type
- notes and outcome

This makes follow-ups a shared action object across the CRM, not only a lead-specific tool.

### Shared System Objects

- `Activity`: unified timeline/audit entries by `entity_type` and `entity_id`
- `Note`: text notes attached to `Lead`, `Opportunity`, `Task`, or `User`
- `Notification`: in-app notifications for assignment, overdue, and stage events

## 3. Leads Module

### What is built

The Leads module includes:

- lead list page with filtering, sorting, paging, import, bulk update, export, and click-to-contact
- lead detail page with:
  - stage control
  - ownership details
  - linked opportunity
  - linked tasks
  - follow-ups
  - notes
  - stage history
  - activity timeline
- lead create and edit flows
- duplicate detection
- stage change workflow
- activity-stage workflow
- import and bulk update endpoints
- Excel export

### Lead creation flow

On create:

- a `lead_number` is generated
- the lead is persisted
- an `Activity` record is created with `lead_created`
- an initial `LeadStageHistory` row is created with `to_stage = New`
- assignee/admin notifications are created
- email notifications are sent

In the lead form:

- owner and assignee are explicitly set
- single opportunity linking is supported from the form
- opportunity selection auto-fills property type
- selected opportunity inventory labels feed `unit_type` options
- duplicate detection runs against phone/email/name
- if `next_followup_date` and `followup_type` are provided on create, a follow-up is auto-created

### Lead detail experience

The lead detail page shows:

- pipeline stage and activity-stage management
- lead contact data
- budget, pipeline value, settlement, and commission fields
- lost reason and alternate requirement when applicable
- linked opportunity card
- linked tasks section
- embedded follow-up management
- recent notes
- recent activity timeline
- recent stage history

### Lead filters and operational buckets

The list supports business-focused filters including:

- leads received today
- pending first action
- no activity
- stale leads
- overdue follow-ups
- to action today
- actioned leads

This means the Leads module is not just a CRUD list; it is being used as an action queue surface.

### Lead stage logic

The stage API supports both:

- pipeline stage updates
- activity-stage updates

Special automation:

- `NotInterested` activity stage auto-resolves pipeline status to `Lost`
- `Junk` activity stage auto-resolves pipeline status to `InvalidLead`

When stage changes occur:

- a timeline `Activity` entry is written
- a `LeadStageHistory` row is added
- admin/assignee emails may be sent
- won/lost notifications are emitted

### Won / lost handling

When a lead is marked `Won`:

- settlement and commission percent can be captured
- linked opportunity `closed_revenue` is recalculated from all won leads
- admin notifications are created
- won-email notification is sent

When a lead is marked `Lost`:

- lost reason and notes can be captured
- admin notifications are created
- lost-email notification is sent

### Lead deletion behavior

Lead deletion is implemented as soft delete on the lead, with linked behavior:

- linked tasks are soft-deleted
- linked follow-ups are hard-deleted
- linked opportunity `closed_revenue` is recalculated
- if the lead was won, monthly commission records may be recalculated when still in `Live` state

This is one of the strongest cross-module business linkages in the system.

## 4. Opportunities Module

### What is built

The Opportunities module includes:

- list page with sorting and export
- detail page with financial summary
- create / edit flows
- inventory/configuration rows
- expense tracking
- tagged lead visibility
- embedded follow-up management

### Opportunity structure

An opportunity is modeled as a commercial entity with inventory/configuration rows.

For standard property types:

- configurations store label, unit count, price per unit, and row total

For land:

- configurations support land area, area unit, sale type, and row total derived from area x price

### Financial rollups

Opportunity financials are calculated automatically:

- `total_sales_value` = sum of configuration totals
- `possible_revenue` = `total_sales_value * commission_percent`
- `closed_revenue` = recalculated from linked leads that are `Won`

This means opportunity revenue is partially inventory-driven and partially lead-conversion-driven.

### Tagged leads

Opportunities expose tagged leads on the detail page, showing:

- lead number
- lead name
- lead status
- lead temperature
- commission figure when settlement and commission percent exist

### Opportunity tagging behavior

Two tagging patterns exist:

- lead form / lead API enforces a practical single-opportunity rule by deleting existing links before creating a new one
- opportunity API also supports tagging a lead to an opportunity directly using upsert

This means the database allows a many-to-many junction, but current lead-form UX is effectively operating in a single-primary-opportunity model.

### Opportunity deletion behavior

Deleting an opportunity:

- soft-deletes linked tasks
- hard-deletes linked follow-ups
- hard-deletes linked expenses
- soft-deletes the opportunity itself

## 5. Follow-ups Module

### What is built

Follow-ups exist in three modes:

- as a standalone global module at `/follow-ups`
- embedded inside lead detail pages
- embedded inside opportunity detail pages

### Follow-up capabilities

Implemented features include:

- create follow-up
- assign follow-up
- mark complete
- mark complete and immediately schedule next
- schedule next without completing
- delete follow-up
- search and sort
- overdue / today / next 3 days / next 7 days / all pending / done buckets
- export to Excel
- mobile and desktop optimized views

### Follow-up types

Supported types:

- Call
- Email
- WhatsApp
- Visit
- Meeting
- Activity
- Internal

### Lead synchronization logic

Lead-linked follow-ups update the lead record itself:

- creating a follow-up can set `lead.next_followup_date` and `lead.followup_type`
- completing a follow-up recalculates the lead’s next pending follow-up
- deleting a pending follow-up also re-syncs the lead’s next follow-up state

This is a critical linkage: follow-ups are not passive records; they actively maintain lead-level follow-up state used by dashboards and action queues.

### Role behavior

Global follow-ups are scoped for Sales and Operations users to:

- follow-ups assigned to them
- or follow-ups created by them

Managers/Admins can work across broader scope and use assignee filtering.

## 6. Tasks Module

### What is built

The Tasks area includes:

- list view
- kanban view
- detailed task page
- task create / edit flows
- task export
- task dashboard
- note support
- activity timeline

### Task linking model

A task can be linked to:

- a lead
- an opportunity
- a client

This makes tasks usable both for CRM pipeline work and client / operational work.

### Task form behavior

The task form supports:

- assignee selection
- due/start dates
- recurrence
- sector selection
- lead linking
- opportunity linking
- client linking
- revenue-tagged tasks with amount

Tasks can also be launched contextually from lead detail pages.

### Task list behavior

The task list supports:

- bucket tabs inspired by the follow-up UX:
  - Overdue
  - Today
  - Next 3 Days
  - Next 7 Days
  - All Active
  - Done
- assignee filter
- client filter
- search
- sortable columns
- list and kanban views

### Task detail behavior

Task detail pages show:

- status and priority
- due/start/completion dates
- assignee and creator
- client and sector
- recurrence
- revenue tagging
- linked lead
- linked opportunity
- notes
- activity timeline

### Task lifecycle behavior

On create:

- `task_number` is generated
- assignment notification can be created
- assignment email can be sent
- `task_created` activity is logged

On update:

- completion date is auto-set when status changes to `Done`
- `task_updated` activity is logged
- reassignment email can be sent

On delete:

- task is soft-deleted

## 7. Dashboards

### A. Sales Dashboard

Purpose:

- day-to-day sales operating dashboard
- period performance + live action queue

Built features:

- period selector:
  - today
  - yesterday
  - this week
  - this month
  - YTD
  - custom
- period KPIs:
  - leads received
  - actioned
  - not actioned
  - response rate
  - deals won in period
- live KPIs:
  - to action today
  - overdue follow-ups
  - today’s follow-ups
  - hot/warm/cold leads
  - pending first contact
  - stale leads
  - no activity
- action queue with direct contact buttons
- charts:
  - pipeline funnel
  - leads by opportunity
  - source distribution
  - sales owner load
  - temperature split
- smart insights text block

Important behavior:

- actioned semantics intentionally exclude the auto-inserted initial stage-history row
- the action queue ranks by temperature, follow-up urgency, and stale status
- dashboard cards deep-link back into filtered lead/follow-up views

### B. CRM Overview Dashboard

Purpose:

- broader management view over pipeline, revenue, tasks, activity, and opportunities

Built features:

- date-range filters shared with other dashboards
- pipeline KPIs:
  - total leads
  - hot leads
  - active leads
  - won/lost
  - today follow-ups
  - overdue follow-ups
- financial KPIs:
  - pipeline value
  - total sales value
  - possible revenue
  - net profit
- today’s focus panels:
  - today follow-ups
  - overdue follow-ups
  - stale hot leads
- lead intelligence:
  - stage distribution
  - temperature split
  - top lead sources
- opportunity intelligence:
  - top active opportunities
  - opportunity category breakdown
- client workload:
  - tasks by client
- recent activity feed
- task overview cards

### C. Task Dashboard

Purpose:

- operational task workload and execution visibility

Built features:

- date-range filtering
- period counts:
  - total due in period
  - completed in period
  - completion rate
- all-time active counts:
  - total active
  - overdue
  - due today
  - my tasks
- revenue-at-risk aggregation from overdue revenue-tagged tasks
- charts:
  - active tasks by assignee
  - active tasks by client
- quick links:
  - list
  - kanban
  - new task
  - my tasks

## 8. Cross-Module Linkages

### Lead <-> Opportunity

- implemented through `LeadOpportunity`
- lead form currently behaves as single-primary-opportunity assignment
- opportunity pages show tagged leads
- sales dashboard uses leads-per-opportunity
- opportunity `closed_revenue` depends on linked won leads

### Lead <-> Follow-up

- follow-ups can be auto-created from the lead form
- follow-up creation/completion/deletion keeps `lead.next_followup_date` synchronized
- overdue and today follow-up dashboards rely on lead-level follow-up fields

### Lead <-> Task

- tasks can be created from lead detail
- lead detail shows linked tasks
- deleting a lead soft-deletes linked tasks

### Opportunity <-> Follow-up

- opportunities support embedded follow-up scheduling and completion
- deleting an opportunity removes linked follow-ups

### Opportunity <-> Task

- tasks can link to an opportunity
- task detail links back to opportunity
- deleting an opportunity soft-deletes linked tasks

### Task <-> Follow-up

- follow-ups can also link to tasks at the API/data layer
- quick add supports task-linked follow-ups
- this creates a path for operational reminders outside classic lead follow-ups

### Lead / Task / Opportunity <-> Activity

- activities are written for:
  - lead creation
  - lead update
  - stage changes
  - contact actions
  - task creation
  - task updates
  - opportunity tagging
- dashboards and detail pages use this for auditability and recent activity views

### Lead / Task <-> Notes

- leads and tasks have note threads
- notes are displayed directly on detail pages

### Lead / Opportunity / Task <-> Dashboards

- leads feed all CRM and sales KPIs
- opportunities feed revenue and category analytics
- tasks feed task dashboards and CRM workload widgets
- follow-up synchronization directly drives “today”, “overdue”, and action queue widgets

## 9. Role-Based Access and Navigation

### Roles

Implemented roles:

- Admin
- Manager
- Sales
- Operations
- Viewer

### High-level permissions

- Admin: full CRM/task/opportunity access, financials, reports, user management
- Manager: near-admin CRM/task/opportunity access plus financials
- Sales:
  - create/read/update leads
  - read opportunities
  - create/read/update tasks
  - commission view
- Operations:
  - create/read/update tasks only
- Viewer:
  - read-only access to leads, opportunities, tasks, and reports

### Scope restrictions

- Sales leads are scoped to owned/assigned leads
- Sales and Operations tasks are scoped to assigned tasks
- Sales opportunities are effectively scoped to opportunities linked to their own leads
- Operations are redirected away from CRM dashboards into tasks

### Sidebar and quick add

Sidebar navigation is role-aware.

Quick Add behavior is also role-aware:

- Admin: Lead, Opportunity, Task, Follow-up, Expense
- Sales: Lead, Task, Follow-up, Expense
- Operations: Task only

## 10. Notifications, Email, and Audit Trail

### In-app notifications

Implemented notification types include:

- lead assigned
- task assigned
- follow-up due / overdue
- task overdue
- hot lead stale
- stage changed
- note added

### Email notifications

The codebase includes email notifications for:

- lead assignment
- lead creation to admins
- lead reassignment
- lead won
- lead lost
- lead stage changed
- lead tagged to opportunity
- opportunity created
- task assignment
- task reassignment

### Audit trail

The `Activity` system provides a unified event log across major CRM actions and is exposed in:

- lead detail timeline
- task detail timeline
- CRM dashboard recent activity feed

## 11. Operational Strengths Already Built

The strongest implemented business behaviors are:

- dashboards deep-linking into actionable filtered lists
- lead follow-up state synchronized from follow-up records
- revenue rollup from opportunities plus won leads
- commission recalculation on lead deletion when relevant
- consistent role scoping across list/API/dashboard experiences
- quick-add access for speed of operation
- click-to-call / WhatsApp actions that also log contact activity

## 12. Notable Constraints / Current Behavior to Be Aware Of

- The database supports many-to-many lead-opportunity links, but the lead workflow currently enforces one active linked opportunity per lead.
- Opportunity tagging can still be initiated from the opportunity API, so the conceptual model is slightly more flexible than the lead UI.
- Follow-ups are richly implemented for leads and opportunities in the UI, while task-linked follow-ups are more data/API oriented than fully surfaced in dedicated task detail UX.
- Lead deletion soft-deletes tasks but hard-deletes follow-ups.
- Opportunity deletion soft-deletes tasks but hard-deletes follow-ups and expenses.
- Task deletion is soft delete.
- Follow-up deletion is restricted to Admin/Manager.
- Operations users are intentionally narrowed to task workflows.

## 13. Summary

The CRM has moved beyond basic CRUD and now behaves like an operating system for sales execution:

- Leads are the central pipeline and action object.
- Opportunities provide structured commercial inventory and revenue potential.
- Follow-ups are the scheduling engine that keeps lead action state current.
- Tasks cover operational execution and can bridge leads, opportunities, and clients.
- Dashboards are not passive reporting pages; they are wired into live queue management and filtered navigation.

The main architectural pattern in the current build is tight operational linkage:

- lead actions influence follow-up state
- won leads influence opportunity revenue
- deleted leads influence commission calculations
- dashboards drive users back into filtered work queues

That linkage is the defining characteristic of what has been built so far.
