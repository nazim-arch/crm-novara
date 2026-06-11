// Shared between the tasks server page and the client TaskTable.
// No server-only imports allowed here.
export type TaskColumnDef = { id: string; label: string; locked?: boolean };

export const TASK_COLUMNS: TaskColumnDef[] = [
  { id: "title", label: "Task", locked: true },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "due_date", label: "Due Date" },
  { id: "assigned_to", label: "Assigned To" },
  { id: "days", label: "Days" },
  { id: "client", label: "Client" },
  { id: "linked", label: "Linked To" },
];
