# DealStack Functionality Built

Date: May 18, 2026

## Purpose

This document summarizes the functionality currently built in the DealStack application. It covers the CRM, follow-up queues, dashboards, sales commission, podcast studio, IntentRadar, reporting, settings, security, and operational automation.

## 1. Application Overview

DealStack is a Next.js CRM and operations platform built around sales execution, lead management, opportunity tracking, task management, follow-up discipline, and revenue visibility.

The application includes:

- Authentication and password reset flows
- Role-based dashboard navigation
- Lead CRM with pipeline and activity-stage management
- Opportunity and inventory management
- Follow-up scheduling and action queues
- Task management with list, detail, and kanban views
- Sales, CRM, task, and activity dashboards
- Admin lead review queue
- Sales focus queue
- Sales commission calculations and reporting
- Podcast studio booking and revenue module
- IntentRadar buyer/seller intent mining module
- Revenue and net profit reports
- User, client, and role permission settings
- Notifications, email alerts, audit timelines, and export features

## 2. Authentication and Access

Built functionality:

- Login page.
- Forgot-password page.
- Reset-password page.
- NextAuth-backed authentication.
- Password reset token model.
- User activation/deactivation support.
- Role-aware redirects.
- Role-aware sidebar navigation.
- Protected dashboard layout.

Supported roles:

- Admin
- Manager
- Sales
- Operations
- Viewer

Access behavior:

- Admin has broad access to CRM, operations, reports, settings, commission, podcast studio, and IntentRadar.
- Manager has management access to CRM and dashboards.
- Sales has access to assigned/owned CRM work, sales dashboard, follow-ups, tasks, and personal commission.
- Operations is focused on task workflows.
- Viewer has read-oriented access where enabled.

## 3. Shared Navigation and Productivity

Built functionality:

- Desktop sidebar.
- Mobile sidebar sheet.
- Role-aware menu sections.
- Quick Add modal.
- Notification bell.
- Shared delete confirmation.
- Shared export buttons.
- Shared activity timeline.
- Shared lead contact actions.
- Shared lead status badges.
- Sortable table headers.

Quick Add supports role-aware creation of:

- Leads
- Opportunities
- Tasks
- Follow-ups
- Opportunity expenses

Recent UI behavior added:

- Many mutation flows now refresh route data inside React transitions to keep the interface responsive after saves, deletes, imports, stage changes, and status updates.

## 4. Leads Module

Built pages:

- Leads list.
- New lead.
- Lead detail.
- Edit lead.
- Leads error boundary.

Built lead list functionality:

- Lead table.
- Filtering.
- Sorting.
- Pagination.
- Activity-stage filtering.
- Search and operational lead buckets.
- Import from spreadsheet.
- Bulk update from spreadsheet.
- Export.
- Click-to-call, WhatsApp, and email actions.

Lead fields supported:

- Lead number.
- Full name.
- Phone, email, WhatsApp.
- Source, campaign source, referral source.
- Lead owner, assignee, creator.
- Temperature.
- Pipeline status.
- Activity stage.
- Lead type.
- Budget range.
- Property type.
- Unit type.
- Location preference.
- Timeline to buy.
- Purpose.
- First and last contact dates.
- Next follow-up date and follow-up type.
- Outcome.
- Interest reason.
- Visit and negotiation status.
- Closing probability.
- Deal value and commission estimate.
- Potential lead value.
- Financing required.
- Won-deal settlement value.
- Won-deal commission percent.
- Not-interested reason and alternate requirement.
- Lost reason and lost notes.
- Soft-delete metadata.

Lead creation behavior:

- Validates form data.
- Generates a lead number.
- Creates the lead record.
- Creates an initial activity record.
- Creates initial stage history.
- Supports owner and assignee selection.
- Supports opportunity linking from the form.
- Auto-fills opportunity-related fields when an opportunity is selected.
- Supports duplicate detection before submission.
- Can create an initial follow-up when follow-up details are supplied.
- Sends assignment/admin notifications where applicable.

Lead detail functionality:

- Lead profile and contact details.
- Pipeline stage changer.
- Activity-stage changer.
- Optimistic stage/status display after change.
- Linked opportunity card.
- Linked tasks section.
- Embedded follow-up section.
- Notes.
- Recent activity timeline.
- Stage history.
- Financial and qualification details.
- Lost/won contextual fields.

Lead stage workflow:

- Pipeline stages include New, Prospect, Site Visit Completed, Negotiation, Won, Lost, Invalid Lead, On Hold, and Recycle.
- Activity stages include New, No Response, Busy, Unreachable, Prospect, Call Back, Not Interested, and Junk.
- Marking activity stage Not Interested can resolve the lead to Lost.
- Marking activity stage Junk can resolve the lead to Invalid Lead.
- Won stage captures settlement value and commission percent.
- Lost stage captures reason and notes.
- Stage changes create activity records.
- Stage changes create lead stage history records.
- Stage changes can create lead review events.
- Won/lost stage changes can notify admins and assignees.

Lead deletion behavior:

- Soft-deletes the lead.
- Soft-deletes linked tasks.
- Deletes linked follow-ups.
- Recalculates linked opportunity closed revenue.
- Recalculates commission records when applicable.

## 5. Lead Follow-up and Contact Logging

Built functionality:

- Lead-linked follow-ups.
- Follow-up creation from lead pages and quick add.
- Follow-up completion.
- Schedule-next follow-up.
- Mark complete and schedule next.
- Delete follow-up with lead synchronization.
- Contact attempt logging.
- Call, WhatsApp, and email contact actions.

Lead synchronization:

- Creating a pending lead follow-up can update the lead's next follow-up date and type.
- Completing a follow-up recalculates the next pending follow-up.
- Deleting a pending follow-up recalculates the next pending follow-up.
- These synchronized fields feed dashboard counts and action queues.

## 6. Opportunities Module

Built pages:

- Opportunities list.
- New opportunity.
- Opportunity detail.
- Edit opportunity.

Built opportunity functionality:

- Opportunity creation and editing.
- Opportunity list filtering/sorting.
- Opportunity export.
- Opportunity detail financial summary.
- Opportunity status tracking.
- Inventory/configuration rows.
- Land-specific configuration support.
- Tagged lead visibility.
- Embedded follow-up section.
- Expense section.

Opportunity fields supported:

- Opportunity number.
- Name and project.
- Developer/seller/buyer-oriented label.
- Opportunity category.
- Property type.
- Location.
- Commission percent.
- Status.
- Notes.
- Total sales value.
- Possible revenue.
- Closed revenue.

Configuration behavior:

- Standard configurations track label, unit count, price per unit, and row total.
- Land configurations support land area, area unit, sale type, and row total.
- Total sales value is calculated from configuration totals.
- Possible revenue is calculated from total sales value and commission percent.

Lead tagging behavior:

- Leads can be linked to opportunities.
- Opportunity detail shows tagged leads.
- Lead form currently behaves like a single-primary-opportunity workflow.
- The database model supports lead-opportunity junction records.

Revenue behavior:

- Opportunity closed revenue is recalculated from linked won leads.
- Won leads contribute settlement value multiplied by deal commission percent.

Opportunity expense behavior:

- Add expenses.
- Delete expenses.
- Expense date, category, description, amount, and added-by metadata are stored.
- Expenses feed net-profit reporting.

Opportunity deletion behavior:

- Soft-deletes the opportunity.
- Soft-deletes linked tasks.
- Deletes linked follow-ups.
- Deletes linked expenses.

## 7. Follow-ups Module

Built pages and surfaces:

- Global follow-ups page.
- Embedded lead follow-up sections.
- Embedded opportunity follow-up sections.
- Focus Queue tab.
- Review Queue tab for admin review workflows.

Follow-up fields supported:

- Lead, opportunity, or task linkage.
- Assigned user.
- Created by user.
- Type.
- Priority.
- Scheduled date/time.
- Callback date/time.
- Completed date/time.
- Notes.
- Outcome.
- Attempt count.
- No-response count.

Follow-up types:

- Call
- Email
- WhatsApp
- Visit
- Meeting
- Activity
- Internal

Global follow-up functionality:

- Create follow-up.
- Update follow-up.
- Mark complete.
- Schedule next.
- Delete where permitted.
- Filter by bucket.
- Search.
- Sort.
- Export.
- Mobile-friendly views.

Follow-up buckets:

- Overdue.
- Due today.
- Next 3 days.
- Next 7 days.
- All pending.
- Done.

## 8. Sales Focus Queue

Built functionality:

- Sales-focused daily action queue.
- Overdue follow-up cards.
- Due-today cards.
- Callback-today cards.
- Completed-today list.
- All active follow-ups list.
- Clickable KPI cards.
- Card-by-card navigation.
- Lead context inside each queue card.
- Mobile-friendly layouts.

Actions supported from the queue:

- Contacted.
- No response.
- Callback today.
- Schedule next.
- Update stage.
- Site visit done.
- Update notes.
- Mark lost.
- Mark won.
- Log call attempt.
- Log WhatsApp attempt.
- Log email attempt.

Queue intelligence:

- Prioritizes by due date, overdue state, lead temperature, potential value, callback state, and response attempts.
- Tracks attempt count and no-response count.
- Supports callback times such as 30 minutes, 1 hour, 2 hours, and end of day.

## 9. Admin Review Queue

Built functionality:

- Admin review queue for lead quality and activity review.
- Queue and history tabs.
- Review event stats.
- Pending, today, ask-agent, parked, escalated, and reviewed buckets.
- Search and filters.
- Agent filter.
- Temperature filter.
- Card-by-card review flow.
- History list with pagination.

Review actions:

- Mark reviewed.
- Park lead until a date.
- Ask agent.
- Schedule client follow-up.
- Escalate lead.
- Add review notes.
- Add quality score.
- Store escalation reason.

Review event triggers:

- Stage changes.
- Follow-up added.
- Temperature changed.
- Assignee changed.
- Note added.
- Field updated.

## 10. Tasks Module

Built pages:

- Tasks list.
- New task.
- Task detail.
- Edit task.

Built task functionality:

- Task creation and editing.
- Task list.
- Task table.
- Kanban board.
- Task status changer.
- Task detail view.
- Task notes.
- Task activity timeline.
- Export.

Task fields supported:

- Task number.
- Title and description.
- Priority.
- Status.
- Due date.
- Start date.
- Completion date.
- Sector.
- Revenue-tagged flag.
- Revenue amount.
- Recurrence.
- Assignee and creator.
- Optional lead link.
- Optional opportunity link.
- Optional client link.
- Soft-delete metadata.

Task views and filters:

- Table view.
- Kanban view.
- Overdue.
- Today.
- Next 3 days.
- Next 7 days.
- All active.
- Done.
- Assignee filter.
- Client filter.
- Search.
- Sortable columns.

Task lifecycle behavior:

- Generates task numbers.
- Creates assignment notifications.
- Sends assignment email.
- Logs task-created activity.
- On update, logs task-updated activity.
- On status Done, sets completion date.
- On reassignment, sends reassignment email.
- Task delete is soft-delete.

Task recurrence:

- Supports recurrence types None, Daily, Weekly, and Monthly.
- Inngest integration exists for recurring task follow-on creation when recurring tasks are completed.

## 11. Dashboards

### Sales Dashboard

Built functionality:

- Period selector.
- Today, yesterday, this week, this month, YTD, and custom ranges.
- Leads received.
- Actioned leads.
- Not-actioned leads.
- Response rate.
- Deals won.
- To-action-today count.
- Overdue follow-ups.
- Today's follow-ups.
- Hot/warm/cold split.
- Pending first contact.
- Stale leads.
- No-activity leads.
- Action queue.
- Pipeline funnel.
- Leads by opportunity.
- Source distribution.
- Sales owner load.
- Temperature split.
- Smart insights block.
- Deep links into filtered lists.

### CRM Overview Dashboard

Built functionality:

- Date-range filtering.
- Total leads.
- Hot leads.
- Active leads.
- Won/lost counts.
- Today follow-ups.
- Overdue follow-ups.
- Pipeline value.
- Total sales value.
- Possible revenue.
- Net profit.
- Today's focus panels.
- Stale hot leads.
- Lead stage distribution.
- Lead source breakdown.
- Opportunity performance.
- Opportunity category breakdown.
- Client workload.
- Recent activity.
- Task overview.
- Financial widgets gated by permission.

### Task Dashboard

Built functionality:

- Date-range filtering.
- Total due in period.
- Completed in period.
- Completion rate.
- Total active tasks.
- Overdue tasks.
- Due today tasks.
- My tasks.
- Revenue at risk from overdue revenue-tagged tasks.
- Active tasks by assignee chart.
- Active tasks by client chart.
- Links to task list, kanban, new task, and my tasks.

### Activity Calendar

Built functionality:

- Daily activity dashboard.
- Calendar view over lead/action/site-visit activity.
- Dashboard route and API route.
- Activity calendar component.
- Sidebar entry for supported roles.

## 12. Command and Action Components

Built functionality present in the codebase:

- Action cards for follow-up/action queues.
- User kanban board for task assignment across users.
- Fast action handling with route refresh transitions.
- Local optimistic updates for task reassignment and status movement.

## 13. Sales Commission Module

Built pages:

- My Commission / Commission Overview.
- Set Targets.
- Commission Report.
- User-specific commission settings page.

Built functionality:

- Monthly commission calculation.
- Sales monthly target management.
- Commission slab management.
- Admin commission overview.
- Individual sales commission dashboard.
- Commission report.
- Commission record finalization support.
- Status badges.

Commission data model:

- Sales commission slabs.
- Monthly targets.
- Monthly commission records.
- Live and Finalized commission record status.

Commission calculation behavior:

- Closed revenue is calculated from won lead settlement and commission values.
- Achievement percent compares closed revenue with target.
- Applicable slab determines commission percentage.
- Commission amount is calculated from closed revenue and slab.
- Won leads with missing settlement value are counted separately.
- Live commission records can be recalculated.
- Finalized records preserve finalized state.

## 14. Reports Module

Built pages:

- Reports page.

Built functionality:

- Revenue report.
- Net profit report.
- Date-range filtering.
- Revenue API.
- Net profit API.
- Opportunity expense data feeds net profit reporting.
- CRM revenue data feeds revenue reporting.

## 15. Podcast Studio Module

Built pages:

- Podcast Studio dashboard.
- Availability calendar.
- Bookings list.
- New booking.
- Edit booking.
- Studio settings.

Built booking functionality:

- One-time booking creation.
- Recurring booking creation.
- Booking editing.
- Booking list.
- Calendar/availability view.
- Conflict detection.
- Bulk recurring booking creation.
- Conflict skipping for recurring bookings.
- Booking status tracking.

Booking fields supported:

- Booking date.
- Start time.
- End time.
- Duration.
- Booking type.
- Seater type.
- Client name.
- Phone.
- Notes.
- Recording hours.
- Recording value.
- Editing hours.
- Editing value.
- GST percent.
- Base amount.
- GST amount.
- Total revenue.
- Status.
- Recurring group id.

Studio scheduling behavior:

- Studio slots are 30-minute intervals.
- Studio hours are 10:00 AM to 8:30 PM.
- End time is calculated from start time and duration.
- Availability is checked against existing bookings.
- Cancelled bookings do not block availability.
- Editing an existing booking excludes itself from conflict checks.

Recurring booking behavior:

- Weekly recurrence.
- Biweekly recurrence.
- Monthly recurrence.
- Custom date/time slot recurrence.
- Preview of generated recurring dates.
- Pre-submit conflict checking.
- Conflicting recurring slots can be skipped.

Revenue behavior:

- Recording value and editing value are tracked separately.
- GST amount is calculated.
- Total revenue is calculated.
- Seater-specific rates can suggest recording and editing values.

Studio settings:

- Configurable seater rates.
- Recording rate per hour.
- Editing rate per hour.

## 16. IntentRadar Module

Built pages:

- IntentRadar dashboard.
- Generate leads.
- IntentRadar leads.
- IntentRadar settings.
- Instagram miner.

Built functionality:

- Campaign-based intent lead generation.
- Buyer and seller intent modes.
- City, micro-market, budget, property type, BHK, buyer persona, urgency, source, and keyword inputs.
- Lead dashboard stats.
- Lead tiering into hot, warm, cool, and watching.
- AI insight fields.
- Recommended action and response draft fields.
- Cross-platform signal storage.
- Source channel configuration.
- Signal log audit trail.
- Campaign lifecycle status.
- Settings storage for API keys and scraping/scoring/AI configuration.
- Encryption support for sensitive settings.

IntentRadar lead attributes:

- Profile handle, name, URL, platform, and avatar.
- Email, phone, LinkedIn URL when available.
- Source platform, source URL, content, type, and capture time.
- Total score and tier.
- Scoring dimensions such as specificity, urgency, budget clarity, engagement velocity, cross-platform confidence, and financial readiness.
- Inferred buyer type, budget, location, timeline, income, NRI status.
- Behavioral patterns.
- Engagement status and notes.
- Intent type and listing price for seller workflows.
- Matched supply for buyer workflows.
- Lead origin type.
- Engagement score and buyer engagement density.
- Hot cluster detection.
- Exact comment and why-flagged explanation.
- Freshness scoring.
- Probabilistic dedupe clustering.

Instagram miner:

- Instagram-focused lead mining route.
- Apify-style Instagram comment mining support in the module.
- Buyer/seller comment-intent processing.

## 17. Settings Module

Built pages:

- User management.
- Client management.
- Role permissions.
- Profile page.
- User commission settings page.

User management:

- Create users.
- Edit users.
- Delete users where permitted.
- Activate/deactivate users.
- Reset user password.
- Reassign user work before removal where supported.
- Role assignment.
- Active/inactive status.

Client management:

- Create clients.
- Edit clients.
- Activate/deactivate clients.
- Store industry, contact person, email, phone, and notes.
- Clients can be linked to tasks.

Role permissions:

- Permission editor.
- RBAC settings API.
- Central permission matrix.
- Role-based checks in routes and APIs.

Profile:

- Update profile name.
- Password update flow.

## 18. Notifications, Email, and Audit Trail

Built notification types:

- Lead assigned.
- Task assigned.
- Follow-up due.
- Follow-up overdue.
- Task overdue.
- Hot lead stale.
- Stage changed.
- Note added.

Built email notification flows:

- Lead assignment.
- Lead creation to admins.
- Lead reassignment.
- Lead won.
- Lead lost.
- Lead stage changed.
- Lead tagged to opportunity.
- Opportunity created.
- Task assignment.
- Task reassignment.

Audit trail:

- Activity records for lead creation, updates, stage changes, contact actions, task creation, task updates, and opportunity tagging.
- Activity timelines on lead and task detail pages.
- Recent activity feed on dashboards.

## 19. Export, Import, and Bulk Operations

Built import/export functionality:

- Lead import.
- Lead bulk update.
- Lead export.
- Opportunity export.
- Task export.
- Follow-up export.

Bulk/update behavior:

- Lead import returns created and failed rows.
- Lead bulk update returns updated, skipped, and failed rows.
- Spreadsheet modals display row-level errors.
- Successful imports and updates refresh route data.

## 20. Health, Cron, and Background Jobs

Built functionality:

- Health check route.
- Leads health route.
- Leads page health route.
- Aggregate health route.
- Daily digest cron route.
- Inngest API route.
- Inngest client.
- Task recurrence function.
- Admin backfill routes for follow-ups and lead review events.

## 21. Data Model Summary

Primary CRM models:

- User.
- PasswordResetToken.
- Lead.
- Opportunity.
- OpportunityConfiguration.
- OpportunityExpense.
- LeadOpportunity.
- Client.
- Task.
- LeadStageHistory.
- Activity.
- Note.
- Attachment.
- Notification.
- FollowUp.

Commission models:

- SalesCommissionSlab.
- SalesMonthlyTarget.
- SalesCommissionRecord.

Podcast Studio models:

- PodcastStudioBooking.
- PodcastStudioRate.

Admin review models:

- LeadReviewEvent.

IntentRadar models:

- ir_settings.
- ir_campaign.
- ir_lead.
- ir_signal_log.
- ir_source_channel.

System models:

- SystemSetting.
- SequenceCounter.

## 22. Cross-Module Business Logic

Lead to opportunity:

- Leads can be linked to opportunities.
- Won leads update opportunity closed revenue.
- Opportunity detail shows tagged leads.

Lead to follow-up:

- Lead follow-ups maintain lead next-follow-up state.
- Dashboards and queues depend on this synchronized state.

Lead to task:

- Tasks can be linked to leads.
- Lead detail shows linked tasks.
- Lead deletion soft-deletes linked tasks.

Opportunity to task:

- Tasks can be linked to opportunities.
- Opportunity deletion soft-deletes linked tasks.

Opportunity to expense:

- Expenses are tracked against opportunities.
- Expenses feed net profit reporting.

Follow-up to review:

- Follow-up and stage events can create lead review events.
- Admin review queue uses those events for QA and coaching workflows.

Lead to commission:

- Won leads feed closed revenue and commission calculations.
- Deleting won leads can recalculate live commission records.

Task to recurrence:

- Completing recurring tasks can trigger background recurrence handling.

## 23. Current Constraints and Notes

- Lead-opportunity database structure supports many-to-many links, but the lead form behaves like a single-primary-opportunity assignment flow.
- Task-linked follow-ups exist at the data/API level, while lead and opportunity follow-up UX is more complete.
- Lead and opportunity deletion use a mix of soft-delete and hard-delete behavior for related records.
- Financial widgets are permission-sensitive.
- Podcast Studio is a standalone business module and is not directly linked to CRM entities.
- IntentRadar has its own prefixed database models and module routes.
- Some generated or older source files contain mojibake/non-ASCII artifacts in comments and visible labels; this document intentionally uses plain ASCII.

## 24. Summary

The application currently contains a complete multi-module sales and operations platform:

- CRM core: leads, opportunities, follow-ups, tasks, notes, activity, and notifications.
- Sales execution: focus queue, contact actions, stage changes, follow-up discipline, and dashboard drill-downs.
- Management control: CRM overview, task overview, activity calendar, admin review queue, RBAC, users, and clients.
- Revenue control: opportunity revenue, expenses, net profit reports, and commission calculations.
- Studio operations: podcast bookings, availability, recurring schedules, rates, and booking revenue.
- Lead generation: IntentRadar campaign generation, source scanning, scoring, AI insights, and signal storage.

The strongest implemented behavior is cross-module automation: lead stage changes affect opportunity revenue and commission, follow-up actions keep leads action-ready, tasks connect CRM and client operations, and dashboards send users back into the exact queues they need to work.
