// Shared between the tasks server page and the client TaskTable.
// No server-only imports allowed here.
export type TaskColumnDef = { id: string; label: string; locked?: boolean; defaultHidden?: boolean };

// defaultHidden columns are available in the picker but off by default.
export const TASK_COLUMNS: TaskColumnDef[] = [
  { id: "title", label: "Task", locked: true },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "due_date", label: "Due Date" },
  { id: "start_date", label: "Start Date", defaultHidden: true },
  { id: "completion_date", label: "Completion Date", defaultHidden: true },
  { id: "assigned_to", label: "Assigned To" },
  { id: "created_by", label: "Created By", defaultHidden: true },
  { id: "days", label: "Days" },
  { id: "client", label: "Client" },
  { id: "linked", label: "Linked To" },
  { id: "sector", label: "Sector", defaultHidden: true },
  { id: "recurrence", label: "Recurrence", defaultHidden: true },
  { id: "revenue", label: "Revenue", defaultHidden: true },
  { id: "description", label: "Description", defaultHidden: true },
  { id: "created_at", label: "Created Date", defaultHidden: true },
  { id: "updated_at", label: "Last Updated", defaultHidden: true },
];
